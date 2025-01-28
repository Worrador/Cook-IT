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

SCOPES = ['https://www.googleapis.com/auth/drive.file']
FILE_NAME = 'Recipes.xlsx'

if getattr(sys, 'frozen', False):
    # If running as a frozen executable
    base_path = sys._MEIPASS
else:
    # If running as a script
    base_path = os.path.dirname(__file__)

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
        self.df_recency = None
        self.file_id = None

    def get_google_drive_service(self):
        creds = None

        try:
            # Load credentials from token.json if available
            if os.path.exists('token.json'):
                creds = Credentials.from_authorized_user_file('token.json', SCOPES)
                print("Loaded credentials from token.json.")

            # Refresh or authenticate if credentials are invalid
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    try:
                        print("Credentials have expired, attempting to refresh...")
                        creds.refresh(Request())
                        print("Credentials successfully refreshed.")
                    except Exception as e:
                        print(f"Failed to refresh credentials: {e}")
                        creds = None  # Force re-authentication
                if not creds:
                    print("Starting re-authentication...")
                    flow = InstalledAppFlow.from_client_secrets_file(json_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                    print("Re-authentication successful.")

                # Save the updated or new credentials
                with open('token.json', 'w') as token:
                    token.write(creds.to_json())
                    print("Credentials have been saved to token.json.")

            # Build and return the Google Drive service
            self.service = build('drive', 'v3', credentials=creds)
            print("Google Drive service initialized.")
            return self.service

        except Exception as e:
            print(f"Error during initialization: {e}")
            raise

    def get_or_create_file(self):
        if os.path.exists(FILE_NAME):
            try:
                # Read only visible sheets
                self.df_recipes = pd.read_excel(FILE_NAME, sheet_name='Recipes')
                # Read hidden recency data
                with pd.ExcelWriter(FILE_NAME, engine='openpyxl', mode='a') as writer:
                    if 'Recency' not in writer.book.sheetnames:
                        self.df_recency = pd.DataFrame(columns=['Recency'])
                        self.df_recency.to_excel(writer, sheet_name='Recency', index=False)
                        writer.book['Recency'].sheet_state = 'hidden'

                stored_file_id = self.df_recipes.get('file_id', [None])[0]
                if pd.notna(stored_file_id):
                    self.file_id = stored_file_id
                    try:
                        self.service.files().get(fileId=self.file_id).execute()
                        return
                    except:
                        pass
            except Exception as e:
                print(f"Error reading Excel: {e}")

        # Create new file with hidden recency sheet
        self.df_recipes = pd.DataFrame(columns=['Recipe Name', 'URL', 'Comment'])
        self.df_recency = pd.DataFrame(columns=['Recency'])

        with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
            self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)
            self.df_recency.to_excel(writer, sheet_name='Recency', index=False)
            writer.book['Recency'].sheet_state = 'hidden'

        file_metadata = {'name': FILE_NAME}
        with open(FILE_NAME, 'rb') as file:
            media = MediaIoBaseUpload(file,
                                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                    resumable=True)
            file = self.service.files().create(body=file_metadata, media_body=media, fields='id').execute()
            self.file_id = file.get('id')

    def save_and_upload(self):
        try:
            with pd.ExcelWriter(FILE_NAME, engine='openpyxl') as writer:
                self.df_recipes.to_excel(writer, sheet_name='Recipes', index=False)
                self.df_recency.to_excel(writer, sheet_name='Recency', index=False)
                writer.book['Recency'].sheet_state = 'hidden'

            with open(FILE_NAME, 'rb') as file:
                media = MediaIoBaseUpload(file,
                                        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        resumable=True)
                self.service.files().update(fileId=self.file_id, media_body=media).execute()

        except Exception as e:
            print(f"Error in save_and_upload: {str(e)}")
            raise

    def download_file(self):
        try:
            print(f"Downloading file:'{FILE_NAME}'...")
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
            print(f"Error downloading file: {str(e)}")
            raise

    def load_workbook(self):
        # Load recipes and recency data
        self.df_recipes = pd.read_excel(FILE_NAME)

        # Ensure recency column exists, initialize if not
        if 'Recency' not in self.df_recipes.columns:
            self.df_recipes['Recency'] = 0

    def choose_recipe(self):
        # Filter recipes and select based on recency
        if len(self.df_recipes) < 1:
            return None, None, None, None

        while True:
            random_recipe = self.df_recipes.sample()
            recency_value = random_recipe['Recency'].values[0]

            if recency_value < random.randint(1, 100):
                return (
                    random_recipe['Recipe Name'].values[0],
                    random_recipe['URL'].values[0],
                    random_recipe['Comment'].values[0],
                    random_recipe.index[0] + 2  # +2 to match previous 1-based indexing
                )

    def update_recency(self, cooked_recipe_names):
        for recipe_name in cooked_recipe_names:
            # Find index of recipe
            mask = self.df_recipes['Recipe Name'] == recipe_name

            # Update recency for matched recipe
            self.df_recipes.loc[mask, 'Recency'] = 105

            # Decrease other recipes' recency
            other_mask = ~mask
            self.df_recipes.loc[other_mask, 'Recency'] = np.maximum(
                self.df_recipes.loc[other_mask, 'Recency'] - 5,
                0
            )

        self.df_recipes.to_excel(FILE_NAME, index=False)
        return True

    def initialize(self):
        with redirect_stdout_to_stderr():
            try:
                self.get_google_drive_service()
                self.get_or_create_file()
                self.download_file()
                self.load_workbook()
            except Exception as e:
                print(f"Error during initialization: {str(e)}")
                raise

    def add_recipe(self, name, url, comment):
        new_recipe = pd.DataFrame({
            'Recipe Name': [name.encode(SYSTEM_ENCODING).decode('utf-8')],
            'URL': [url],
            'Comment': [comment.encode(SYSTEM_ENCODING).decode('utf-8')],
            'Recency': [0]
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