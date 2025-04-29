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
FILE_NAME = 'Recipes.xlsx'

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
        # Add default columns if they don't exist
        self.default_columns = ['Recipe Name', 'URL', 'Comment', 'Last Shown']

    @property
    def recipe_count(self):
        """Return the number of recipes in the DataFrame."""
        return len(self.df_recipes) if self.df_recipes is not None else 0

    def load_local_file(self):
        if os.path.exists(FILE_NAME):
            try:
                self.df_recipes = pd.read_excel(FILE_NAME)
                self.df_recipes = self.df_recipes.fillna("")

                # Ensure all required columns exist
                for col in self.default_columns:
                    if col not in self.df_recipes.columns:
                        if col == 'Last Shown':
                            self.df_recipes[col] = pd.NaT  # Use NaT (Not a Time) for new recipes
                        else:
                            self.df_recipes[col] = 0

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
                # Add 'sharedWithMe' to include files shared with the user
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
                    self.df_recipes = pd.DataFrame(columns=['Recipe Name', 'URL', 'Comment', 'Recency'])
                self.save_and_upload()

            self.sync_complete = True

        except Exception as e:
            print(f"Error in remote sync: {e}", file=sys.stderr)
            raise

    def save_local_file_only(self):
        """Save changes to local file only without attempting to upload to Drive"""
        try:
            with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
                self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)

                # Hide both Recency and Last Shown columns
                if 'Recency' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['D'].hidden = True
                if 'Last Shown' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['E'].hidden = True

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

            print(f"Changes found both in remote and local Recipe book, number of differences: {str(total_diff)}", file=sys.stderr)

            # Create merged dataframe starting with remote data
            merged_df = remote_df.copy()

            # Add new local recipes
            new_local_records = local_df[local_df.apply(
                lambda x: (x['Recipe Name'], x['URL'], x['Comment']) in new_local, axis=1
            )]
            merged_df = pd.concat([merged_df, new_local_records], ignore_index=True)

            # Update recency values
            # Keep higher recency value between local and remote for matching recipes
            merged_df['Recency'] = merged_df['Recency'].apply(lambda x: 0.0 if (x == "" or pd.isna(x)) else float(x))
            local_df['Recency'] = local_df['Recency'].apply(lambda x: 0.0 if (x == "" or pd.isna(x)) else float(x))

            for idx, row in merged_df.iterrows():
                key = (row['Recipe Name'], row['URL'], row['Comment'])
                local_match = local_df[
                    (local_df['Recipe Name'] == key[0]) &
                    (local_df['URL'] == key[1]) &
                    (local_df['Comment'] == key[2])
                ]

                if not local_match.empty:
                    merged_df.at[idx, 'Recency'] = max(
                        row['Recency'],
                        local_match.iloc[0]['Recency']
                    )

            # Cleanup
            os.remove(remote_temp)
            print(f"Changes merged. Number of recipes locally before: {str(len(local_keys))}, Number of recipes after merge: {str(len(merged_df))}", file=sys.stderr)
            return merged_df

        except Exception as e:
            print(f"Error during merge: {str(e)}", file=sys.stderr)
            raise

    def save_and_upload(self):
        try:
            with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
                self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)

                # Hide both Recency and Last Shown columns
                if 'Recency' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['D'].hidden = True
                if 'Last Shown' in self.df_recipes.columns:
                    writer.sheets['Recipes'].column_dimensions['E'].hidden = True

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
        """Calculate recency (0-100) based on time since last shown"""
        if pd.isna(last_shown):
            return 0

        current_time = pd.Timestamp.now()
        time_diff = (current_time - last_shown).total_seconds() / 3600  # hours

        # Calculate decay based on time difference
        decay = 0.2 * time_diff

        # Cap the decay at 80 (to keep recipes highly relevant)
        decay = min(decay, 80)

        # Recency is 100 minus decay
        return max(100 - decay, 0)

    def choose_recipe(self, suggested_recipes=None):
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
            weights = available_recipes['Last Shown'].apply(self.calculate_recency)

            # Normalize weights to sum to 1
            weights = weights / weights.sum()

            # Select a recipe using the weights
            random_recipe = available_recipes.sample(weights=weights)

            # Update the last shown time for the selected recipe
            self.df_recipes.loc[random_recipe.index, 'Last Shown'] = pd.Timestamp.now()
            self.df_recipes.to_excel(FILE_NAME, index=False)

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
        current_time = pd.Timestamp.now()

        for recipe_name in cooked_recipe_names:
            # Find index of recipe
            mask = self.df_recipes['Recipe Name'] == recipe_name

            # Update last shown time for matched recipe
            self.df_recipes.loc[mask, 'Last Shown'] = current_time

        self.df_recipes.to_excel(FILE_NAME, index=False)
        return True

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
            'Last Shown': [pd.NaT]  # Initialize as NaT (Not a Time)
        })

        self.df_recipes = pd.concat([self.df_recipes, new_recipe], ignore_index=True)
        self.df_recipes.to_excel(FILE_NAME, index=False)

    def delete_recipe(self, name, comment):
        # Find the recipe to delete
        mask = (
            (self.df_recipes['Recipe Name'] == name.encode(SYSTEM_ENCODING).decode('utf-8')) &
            (self.df_recipes['Comment'] == comment.encode(SYSTEM_ENCODING).decode('utf-8'))
        )

        if mask.any():
            self.df_recipes = self.df_recipes[~mask]
            self.df_recipes.to_excel(FILE_NAME, index=False)
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
            self.df_recipes.to_excel(FILE_NAME, index=False)
            return True

        return False