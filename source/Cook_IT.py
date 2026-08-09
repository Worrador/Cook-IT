import os
import sys
import random
import io
import pandas as pd
import numpy as np
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
import contextlib
import locale

# Get the system's default encoding
SYSTEM_ENCODING = locale.getpreferredencoding()

SCOPES = ['https://www.googleapis.com/auth/drive']
FILE_NAME = 'CookIT_Recipes.xlsx'

if getattr(sys, 'frozen', False):
    # If running as a frozen executable
    base_path = sys._MEIPASS
else:
    # If running as a script
    base_path = os.getcwd()

json_path = os.path.join(base_path, 'credentials.json')

@contextlib.contextmanager
def redirect_stdout_to_stderr():
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield
    finally:
        sys.stdout = old_stdout


class CookITLogic:
    def __init__(self):
        self.service = None
        self.df_recipes = None
        self.file_id = None
        self.sync_complete = False
        # Add default columns if they don't exist (support both mobile and desktop formats)
        self.default_columns = ['Recipe Name', 'URL', 'Comment', 'Last Shown', 'Last Cooked Date', 'Pinned']

    @property
    def recipe_count(self):
        """Return the number of recipes in the DataFrame."""
        return len(self.df_recipes) if self.df_recipes is not None else 0

    def load_local_file(self):
        if os.path.exists(FILE_NAME):
            try:
                self.df_recipes = pd.read_excel(FILE_NAME, sheet_name='Recipes')
                self.df_recipes = self.df_recipes.fillna("")

                # Convert Last Cooked Date to Last Shown (for backwards compatibility with mobile app)
                if 'Last Cooked Date' in self.df_recipes.columns and 'Last Shown' not in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Cooked Date'], errors='coerce')
                elif 'Last Shown' in self.df_recipes.columns:
                    # Keep Last Shown but also create Last Cooked Date for mobile compatibility
                    if 'Last Cooked Date' not in self.df_recipes.columns:
                        self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Shown']

                # Initialize Pinned column if missing
                if 'Pinned' not in self.df_recipes.columns:
                    self.df_recipes['Pinned'] = ""

                # Convert Last Shown to datetime
                if 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Shown'], errors='coerce')

                return True
            except Exception as e:
                print(f"Error loading local file: {e}", file=sys.stderr)
                return False
        return False

    def _handle_remote_sync(self):
        try:
            results = self.service.files().list(
                q=f"name='{FILE_NAME}' and trashed=false",
                spaces='drive',
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                fields="files(id, name)").execute()
            items = results.get('files', [])

            if items:
                self.file_id = items[0]['id']

                # Check if local file exists
                if os.path.exists(FILE_NAME):
                    # Perform merge if local file exists
                    self.df_recipes = self.merge_local_changes()
                    return

                # If no local file, just download
                self.download_file()
                excel_file = pd.ExcelFile(FILE_NAME)
                self.df_recipes = pd.read_excel(excel_file, sheet_name='Recipes')
                self.df_recipes = self.df_recipes.fillna("")
                return
            else:
                # Create new file if not found
                if self.df_recipes is None:
                    self.df_recipes = pd.DataFrame(columns=['Recipe Name', 'URL', 'Comment', 'Last Shown', 'Last Cooked Date', 'Pinned'])
                    self.save_and_upload()

            self.sync_complete = True

        except Exception as e:
            print(f"Error in remote sync: {e}", file=sys.stderr)
            raise

    def save_local_file_only(self):
        """Save changes to local file only without attempting to upload to Drive"""
        try:
            with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
                # Ensure Last Cooked Date exists (for mobile compatibility)
                if 'Last Cooked Date' not in self.df_recipes.columns and 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Shown']
                elif 'Last Cooked Date' in self.df_recipes.columns and 'Last Shown' not in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Cooked Date'], errors='coerce')

                # Convert Last Shown to datetime format for Excel
                if 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Shown'])

                # Format Last Cooked Date as string for mobile compatibility
                if 'Last Cooked Date' in self.df_recipes.columns:
                    self.df_recipes['Last Cooked Date'] = pd.to_datetime(self.df_recipes['Last Cooked Date']).dt.strftime('%Y-%m-%d')
                    self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Cooked Date'].fillna('')

                # Ensure Pinned column exists
                if 'Pinned' not in self.df_recipes.columns:
                    self.df_recipes['Pinned'] = "No"
                    self.df_recipes['Pinned'] = self.df_recipes['Pinned'].fillna("No")

                # Write Recipes sheet
                self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)

                # Hide Last Shown column (if it exists)
                if 'Last Shown' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['D'].hidden = True

                # Create Pinned Recipes sheet for mobile compatibility
                if 'Pinned' in self.df_recipes.columns:
                    pinned_recipes = self.df_recipes[self.df_recipes['Pinned'] == 'Yes'][['Recipe Name']].copy()
                    pinned_recipes.to_excel(writer, sheet_name='Pinned Recipes', index=False)

            return True
        except Exception as e:
            print(f"Error saving local file: {str(e)}", file=sys.stderr)
            raise

    def get_google_drive_service(self, timeout=5):
        """Initialize Google Drive service with timeout to detect offline state."""
        creds = None

        try:
            # Check internet connectivity first with timeout
            try:
                import socket
                socket.create_connection(("www.google.com", 443), timeout=timeout)
            except (socket.timeout, socket.error):
                print("Internet connectivity check failed.", file=sys.stderr)
                return False

            # Load credentials from token.json if available
            if os.path.exists('token.json'):
                creds = Credentials.from_authorized_user_file('token.json', SCOPES)
                print("Loaded credentials from token.json.", file=sys.stderr)

            # Refresh or authenticate if credentials are invalid
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    try:
                        print("Credentials have expired, attempting to refresh...", file=sys.stderr)
                        creds.refresh(Request())
                        print("Credentials successfully refreshed.", file=sys.stderr)
                    except Exception as e:
                        print(f"Failed to refresh credentials: {e}", file=sys.stderr)
                        creds = None  # Force re-authentication
                if not creds:
                    print("Starting re-authentication...", file=sys.stderr)
                    flow = InstalledAppFlow.from_client_secrets_file(json_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                    print("Re-authentication successful.", file=sys.stderr)

                # Save the updated or new credentials
                with open('token.json', 'w') as token:
                    token.write(creds.to_json())
                    print("Credentials have been saved to token.json.", file=sys.stderr)

            # Build and return the Google Drive service
            self.service = build('drive', 'v3', credentials=creds)
            print("Google Drive service initialized.", file=sys.stderr)
            return True

        except Exception as e:
            print(f"Error during initialization: {e}", file=sys.stderr)
            return False

    def merge_local_changes(self):
        try:
            # Read local file
            local_df = pd.read_excel(FILE_NAME)
            local_df = local_df.fillna("")

            # Download and read remote file
            remote_temp = 'remote_' + FILE_NAME
            request = self.service.files().get_media(fileId=self.file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                _, done = downloader.next_chunk()
            fh.seek(0)
            with open(remote_temp, 'wb') as f:
                f.write(fh.read())

            remote_df = pd.read_excel(remote_temp)
            remote_df = remote_df.fillna("")

            # Convert Last Shown to datetime in both dataframes
            if 'Last Shown' in local_df.columns:
                local_df['Last Shown'] = pd.to_datetime(local_df['Last Shown'], errors='coerce')
            if 'Last Shown' in remote_df.columns:
                remote_df['Last Shown'] = pd.to_datetime(remote_df['Last Shown'], errors='coerce')

            # Also handle Last Cooked Date for mobile compatibility
            if 'Last Cooked Date' in local_df.columns:
                local_df['Last Cooked Date'] = pd.to_datetime(local_df['Last Cooked Date'], errors='coerce')
            if 'Last Cooked Date' in remote_df.columns:
                remote_df['Last Cooked Date'] = pd.to_datetime(remote_df['Last Cooked Date'], errors='coerce')

            # Merge logic
            # Use recipe name, URL, and comment as composite key for comparison
            local_keys = set(zip(local_df['Recipe Name'], local_df['URL'], local_df['Comment']))
            remote_keys = set(zip(remote_df['Recipe Name'], remote_df['URL'], remote_df['Comment']))

            # Find new and deleted recipes
            new_local = local_keys - remote_keys
            new_remote = remote_keys - local_keys
            total_diff = len(new_local) + len(new_remote)

            if total_diff == 0:
                os.remove(remote_temp)
                return local_df

            print(f"Changes found both in remote and local Recipe book, number of differences: {str(total_diff)}")

            # Create merged dataframe starting with remote data
            merged_df = remote_df.copy()

            # Add new local recipes
            new_local_records = local_df[local_df.apply(
                lambda x: (x['Recipe Name'], x['URL'], x['Comment']) in new_local, axis=1
            )]
            merged_df = pd.concat([merged_df, new_local_records], ignore_index=True)

            # Update Last Shown values
            # Keep the most recent Last Shown value between local and remote for matching recipes
            for idx, row in merged_df.iterrows():
                key = (row['Recipe Name'], row['URL'], row['Comment'])
                local_match = local_df[
                    (local_df['Recipe Name'] == key[0]) &
                    (local_df['URL'] == key[1]) &
                    (local_df['Comment'] == key[2])
                ]

                if not local_match.empty:
                    local_last_shown = local_match.iloc[0]['Last Shown']
                    remote_last_shown = row['Last Shown']

                    # If either timestamp is NaT, use the non-NaT one
                    if pd.isna(local_last_shown) and not pd.isna(remote_last_shown):
                        merged_df.at[idx, 'Last Shown'] = remote_last_shown
                    elif not pd.isna(local_last_shown) and pd.isna(remote_last_shown):
                        merged_df.at[idx, 'Last Shown'] = local_last_shown
                    # If both are valid timestamps, use the more recent one
                    elif not pd.isna(local_last_shown) and not pd.isna(remote_last_shown):
                        merged_df.at[idx, 'Last Shown'] = max(local_last_shown, remote_last_shown)

                    # Also update Last Cooked Date if it exists (mobile compatibility)
                    if 'Last Cooked Date' in local_match.columns and 'Last Cooked Date' in merged_df.columns:
                        local_last_cooked = local_match.iloc[0]['Last Cooked Date']
                        remote_last_cooked = row.get('Last Cooked Date')
                        if pd.notna(local_last_cooked) and pd.notna(remote_last_cooked):
                            merged_df.at[idx, 'Last Cooked Date'] = max(local_last_cooked, remote_last_cooked)
                        elif pd.notna(local_last_cooked):
                            merged_df.at[idx, 'Last Cooked Date'] = local_last_cooked
                        elif pd.notna(remote_last_cooked):
                            merged_df.at[idx, 'Last Cooked Date'] = remote_last_cooked

            # Cleanup
            os.remove(remote_temp)
            print(f"Changes merged. Number of recipes locally before: {str(len(local_keys))}, Number of recipes after merge: {str(len(merged_df))}")
            return merged_df

        except Exception as e:
            print(f"Error during merge: {str(e)}", file=sys.stderr)
            raise

    def save_and_upload(self):
        try:
            with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
                # Ensure Last Cooked Date exists (for mobile compatibility)
                if 'Last Cooked Date' not in self.df_recipes.columns and 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Shown']
                elif 'Last Cooked Date' in self.df_recipes.columns and 'Last Shown' not in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Cooked Date'], errors='coerce')

                # Convert Last Shown to datetime format for Excel
                if 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Shown'])

                # Format Last Cooked Date as string for mobile compatibility
                if 'Last Cooked Date' in self.df_recipes.columns:
                    self.df_recipes['Last Cooked Date'] = pd.to_datetime(self.df_recipes['Last Cooked Date']).dt.strftime('%Y-%m-%d')
                    self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Cooked Date'].fillna('')

                # Ensure Pinned column exists
                if 'Pinned' not in self.df_recipes.columns:
                    self.df_recipes['Pinned'] = "No"
                    self.df_recipes['Pinned'] = self.df_recipes['Pinned'].fillna("No")

                # Write Recipes sheet
                self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)

                # Hide Last Shown column (if it exists)
                if 'Last Shown' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['D'].hidden = True

                # Create Pinned Recipes sheet for mobile compatibility
                if 'Pinned' in self.df_recipes.columns:
                    pinned_recipes = self.df_recipes[self.df_recipes['Pinned'] == 'Yes'][['Recipe Name']].copy()
                    pinned_recipes.to_excel(writer, sheet_name='Pinned Recipes', index=False)

            # Upload to Drive
            with open(FILE_NAME, 'rb') as file:
                media = MediaIoBaseUpload(file,
                                        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        resumable=True)

                # If file_id exists, update the file
                if self.file_id:
                    self.service.files().update(fileId=self.file_id, media_body=media).execute()
                # Otherwise create a new file
                else:
                    file_metadata = {'name': FILE_NAME}
                    file = self.service.files().create(body=file_metadata,
                                                    media_body=media,
                                                    fields='id').execute()
                    self.file_id = file.get('id')

        except Exception as e:
            print(f"Error in save_and_upload: {str(e)}", file=sys.stderr)
            raise

    def download_file(self):
        try:
            print(f"Downloading file:'{FILE_NAME}'...", file=sys.stderr)
            request = self.service.files().get_media(fileId=self.file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                _, done = downloader.next_chunk()
            fh.seek(0)
            with open(FILE_NAME, 'wb') as f:
                f.write(fh.read())
        except Exception as e:
            print(f"Error downloading file: {str(e)}", file=sys.stderr)
            raise

    def calculate_recency(self, last_shown):
        """Calculate selection weight (20-100) based on time since last shown.

        Recipes shown/cooked LONGER ago get a HIGHER weight so they resurface,
        while recently shown recipes get the minimum weight. This matches the
        app's goal of suggesting recipes you haven't made in a while.
        """
        if pd.isna(last_shown):
            return 100  # Never shown recipes get highest priority

        current_time = pd.Timestamp.now()
        time_diff = (current_time - last_shown).total_seconds() / 3600  # hours

        # Weight grows with time since last shown
        boost = 0.2 * time_diff

        # Cap the boost at 80 (so weight maxes out at 100)
        boost = min(boost, 80)

        # Weight ranges from 20 (just shown) up to 100 (long ago / never)
        return min(20 + boost, 100)

    def choose_recipe(self, suggested_recipes=None):
        # Initialize DataFrame if it doesn't exist
        if self.df_recipes is None:
            self.df_recipes = pd.DataFrame(columns=['Recipe Name', 'URL', 'Comment', 'Last Shown', 'Last Cooked Date', 'Pinned'])
            return None, None, None, None

        # Filter recipes and select based on recency
        if len(self.df_recipes) < 1:
            return None, None, None, None

        if suggested_recipes is None:
            suggested_recipes = []

        # Create a list of available recipes (not in suggested_recipes)
        available_recipes = self.df_recipes[~self.df_recipes['Recipe Name'].isin(suggested_recipes)]

        if len(available_recipes) == 0:
            return None, None, None, None

        try:
            # Calculate weights based on recency
            # For recipes with no Last Shown value, use a high weight to prioritize them
            weights = available_recipes['Last Shown'].apply(lambda x: 100 if pd.isna(x) else self.calculate_recency(x))

            # Normalize weights to sum to 1
            weights = weights / weights.sum()

            # Select a recipe using the weights
            random_recipe = available_recipes.sample(weights=weights)

            return (
                random_recipe['Recipe Name'].values[0],
                random_recipe['URL'].values[0],
                random_recipe['Comment'].values[0],
                random_recipe.index[0] + 2  # +2 to match previous 1-based indexing
            )
        except Exception as e:
            print(f"Error in choose_recipe: {e}", file=sys.stderr)
            # Fallback to simple random selection if weight calculation fails
            random_recipe = available_recipes.sample(n=1)
            return (
                random_recipe['Recipe Name'].values[0],
                random_recipe['URL'].values[0],
                random_recipe['Comment'].values[0],
                random_recipe.index[0] + 2
            )

    def update_recency(self, cooked_recipe_names):
        """Update Last Shown time for cooked recipes"""
        current_time = pd.Timestamp.now()

        for recipe_name in cooked_recipe_names:
            # Find index of recipe
            mask = self.df_recipes['Recipe Name'] == recipe_name

            # Update last shown time for matched recipe
            self.df_recipes.loc[mask, 'Last Shown'] = current_time
            # Also update Last Cooked Date for mobile compatibility
            if 'Last Cooked Date' in self.df_recipes.columns:
                self.df_recipes.loc[mask, 'Last Cooked Date'] = current_time

        # Save changes to file
        self.save_excel_file()
        return True

    def save_excel_file(self):
        """Helper method to save Excel file with mobile-compatible formatting"""
        try:
            with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
                # Ensure Last Cooked Date exists (for mobile compatibility)
                if 'Last Cooked Date' not in self.df_recipes.columns and 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Shown']
                elif 'Last Cooked Date' in self.df_recipes.columns and 'Last Shown' not in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Cooked Date'], errors='coerce')

                # Convert Last Shown to datetime format for Excel
                if 'Last Shown' in self.df_recipes.columns:
                    self.df_recipes['Last Shown'] = pd.to_datetime(self.df_recipes['Last Shown'])

                # Format Last Cooked Date as string for mobile compatibility
                if 'Last Cooked Date' in self.df_recipes.columns:
                    self.df_recipes['Last Cooked Date'] = pd.to_datetime(self.df_recipes['Last Cooked Date']).dt.strftime('%Y-%m-%d')
                    self.df_recipes['Last Cooked Date'] = self.df_recipes['Last Cooked Date'].fillna('')

                # Ensure Pinned column exists
                if 'Pinned' not in self.df_recipes.columns:
                    self.df_recipes['Pinned'] = "No"
                    self.df_recipes['Pinned'] = self.df_recipes['Pinned'].fillna("No")

                # Write Recipes sheet
                self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)

                # Hide Last Shown column (if it exists)
                if 'Last Shown' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['D'].hidden = True

                # Create Pinned Recipes sheet for mobile compatibility
                if 'Pinned' in self.df_recipes.columns:
                    pinned_recipes = self.df_recipes[self.df_recipes['Pinned'] == 'Yes'][['Recipe Name']].copy()
                    pinned_recipes.to_excel(writer, sheet_name='Pinned Recipes', index=False)
        except Exception as e:
            print(f"Error saving Excel file: {str(e)}", file=sys.stderr)
            raise

    def initialize(self):
        with redirect_stdout_to_stderr():
            try:
                self.get_google_drive_service()
                self.get_or_create_file()
            except Exception as e:
                print(f"Error during initialization: {str(e)}", file=sys.stderr)
                raise

    def add_recipe(self, name, url, comment):
        new_recipe = pd.DataFrame({
            'Recipe Name': [name.encode(SYSTEM_ENCODING).decode('utf-8')],
            'URL': [url],
            'Comment': [comment.encode(SYSTEM_ENCODING).decode('utf-8')],
            'Last Shown': [pd.NaT],  # Initialize as NaT (Not a Time)
            'Last Cooked Date': [''],
            'Pinned': ['No']
        })

        self.df_recipes = pd.concat([self.df_recipes, new_recipe], ignore_index=True)
        self.save_excel_file()

    def delete_recipe(self, name, comment):
        # Find the recipe to delete
        mask = (
            (self.df_recipes['Recipe Name'] == name.encode(SYSTEM_ENCODING).decode('utf-8')) &
            (self.df_recipes['Comment'] == comment.encode(SYSTEM_ENCODING).decode('utf-8'))
        )

        if mask.any():
            self.df_recipes = self.df_recipes[~mask]
            self.save_excel_file()
            return {"success": True, "message": "Recipe deleted"}

        return {"success": False, "message": "Recipe not found"}

    def update_recipe_comment(self, name, url, old_comment, new_comment):
        # Find the recipe to update
        mask = (
            (self.df_recipes['Recipe Name'] == name.encode(SYSTEM_ENCODING).decode('utf-8')) &
            (self.df_recipes['URL'] == url) &
            (self.df_recipes['Comment'] == old_comment.encode(SYSTEM_ENCODING).decode('utf-8'))
        )

        if mask.any():
            self.df_recipes.loc[mask, 'Comment'] = new_comment.encode(SYSTEM_ENCODING).decode('utf-8')
            self.save_excel_file()
            return True

        return False

    def add_sample_recipes(self):
        try:
            # Initialize DataFrame if it doesn't exist
            if self.df_recipes is None:
                self.df_recipes = pd.DataFrame(columns=['Recipe Name', 'URL', 'Comment', 'Last Shown', 'Last Cooked Date', 'Pinned'])

            sample_recipes = [
                {
                    'name': 'Classic Margherita Pizza',
                    'url': 'https://www.allrecipes.com/recipe/240376/homemade-margherita-pizza/',
                    'comment': 'Perfect for a quick dinner. Try adding fresh basil leaves after baking.'
                },
                {
                    'name': 'Chicken Tikka Masala',
                    'url': 'https://www.allrecipes.com/recipe/239867/authentic-chicken-tikka-masala/',
                    'comment': 'Serve with basmati rice and naan bread.'
                },
                {
                    'name': 'Beef Bourguignon',
                    'url': 'https://www.allrecipes.com/recipe/228654/classic-beef-bourguignon/',
                    'comment': 'Best made a day ahead. Serve with crusty bread.'
                },
                {
                    'name': 'Vegetable Stir Fry',
                    'url': 'https://www.allrecipes.com/recipe/24074/quick-and-easy-vegetable-stir-fry/',
                    'comment': 'Use any vegetables you have on hand.'
                },
                {
                    'name': 'Chocolate Chip Cookies',
                    'url': 'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/',
                    'comment': 'Add a pinch of sea salt on top before baking.'
                },
                {
                    'name': 'Greek Salad',
                    'url': 'https://www.allrecipes.com/recipe/214931/authentic-greek-salad/',
                    'comment': 'Use high-quality feta cheese for best results.'
                },
                {
                    'name': 'Pad Thai',
                    'url': 'https://www.allrecipes.com/recipe/42968/pad-thai/',
                    'comment': 'Don\'t skip the peanuts and lime!'
                },
                {
                    'name': 'Beef Tacos',
                    'url': 'https://www.allrecipes.com/recipe/239023/authentic-beef-tacos/',
                    'comment': 'Serve with fresh salsa and guacamole.'
                },
                {
                    'name': 'Vegetable Soup',
                    'url': 'https://www.allrecipes.com/recipe/12982/vegetable-soup/',
                    'comment': 'Freezes well. Add pasta just before serving.'
                },
                {
                    'name': 'Chicken Curry',
                    'url': 'https://www.allrecipes.com/recipe/212721/indian-chicken-curry-murgh-kari/',
                    'comment': 'Adjust spice level to taste.'
                },
                {
                    'name': 'Pasta Carbonara',
                    'url': 'https://www.allrecipes.com/recipe/245775/spaghetti-alla-carbonara/',
                    'comment': 'Use fresh eggs and good quality pancetta.'
                },
                {
                    'name': 'Fish and Chips',
                    'url': 'https://www.allrecipes.com/recipe/254365/fish-and-chips/',
                    'comment': 'Serve with malt vinegar and tartar sauce.'
                },
                {
                    'name': 'Chocolate Cake',
                    'url': 'https://www.allrecipes.com/recipe/17981/one-bowl-chocolate-cake-iii/',
                    'comment': 'Top with ganache for extra richness.'
                },
                {
                    'name': 'Caesar Salad',
                    'url': 'https://www.allrecipes.com/recipe/229064/classic-caesar-salad/',
                    'comment': 'Make your own croutons for best results.'
                },
                {
                    'name': 'Beef Stew',
                    'url': 'https://www.allrecipes.com/recipe/14685/slow-cooker-beef-stew-i/',
                    'comment': 'Perfect for cold winter days.'
                },
                {
                    'name': 'Shrimp Scampi',
                    'url': 'https://www.allrecipes.com/recipe/229960/shrimp-scampi-with-pasta/',
                    'comment': 'Use fresh garlic and parsley.'
                },
                {
                    'name': 'Apple Pie',
                    'url': 'https://www.allrecipes.com/recipe/12682/apple-pie-by-grandma-ople/',
                    'comment': 'Serve warm with vanilla ice cream.'
                },
                {
                    'name': 'Chicken Noodle Soup',
                    'url': 'https://www.allrecipes.com/recipe/26460/quick-and-easy-chicken-noodle-soup/',
                    'comment': 'Add fresh herbs at the end.'
                },
                {
                    'name': 'Beef Stir Fry',
                    'url': 'https://www.allrecipes.com/recipe/228823/quick-beef-stir-fry/',
                    'comment': 'Slice beef thinly against the grain.'
                },
                {
                    'name': 'Chocolate Mousse',
                    'url': 'https://www.allrecipes.com/recipe/25678/chocolate-mousse/',
                    'comment': 'Chill for at least 2 hours before serving.'
                }
            ]

            for recipe in sample_recipes:
                self.add_recipe(recipe['name'], recipe['url'], recipe['comment'])

            # Save the file after adding all recipes
            self.save_excel_file()
            return True
        except Exception as e:
            print(f"Error adding sample recipes: {e}", file=sys.stderr)
            raise