import random
import os
import io
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
import openpyxl

SCOPES = ['https://www.googleapis.com/auth/drive.file']

class CookITLogic:
    def __init__(self):
        self.service = None
        self.wb = None
        self.ws_recipes = None
        self.ws_recency = None
        self.row_count = 0

    def get_google_drive_service(self):
        creds = None
        if os.path.exists('token.json'):
            creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
                creds = flow.run_local_server(port=0)
            with open('token.json', 'w') as token:
                token.write(creds.to_json())
        self.service = build('drive', 'v3', credentials=creds)

    def download_file(self):
        file_id = 'your_google_drive_file_id_here'  # Replace with your actual file ID
        request = self.service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        fh.seek(0)
        with open('Recipes.xlsx', 'wb') as f:
            f.write(fh.read())

    def create_workbook(self):
        if not os.path.exists('Recipes.xlsx'):
            self.wb = openpyxl.Workbook()
            self.ws_recipes = self.wb.active
            self.ws_recipes.title = 'Recipes'
            self.ws_recency = self.wb.create_sheet(title='Recency')
            self.wb.save('Recipes.xlsx')

    def load_workbook(self):
        self.wb = openpyxl.load_workbook('Recipes.xlsx')
        self.ws_recipes = self.wb['Recipes']
        self.ws_recency = self.wb['Recency']
        self.row_count = self.ws_recipes.max_row

    def choose_recipe(self):
        while True:
            random_row_number = random.randint(2, self.row_count)
            recency_value = self.ws_recency.cell(row=random_row_number, column=1).value or 0

            if recency_value < random.randint(1, 100):
                recipe_name = self.ws_recipes.cell(row=random_row_number, column=1).value
                url = self.ws_recipes.cell(row=random_row_number, column=2).value
                return recipe_name, url, random_row_number

    def update_recency(self, chosen_row):
        self.ws_recency.cell(row=chosen_row, column=1, value=105)

        for row in range(2, self.row_count + 1):
            cell = self.ws_recency.cell(row=row, column=1)
            if cell.value is not None:
                cell.value = max(cell.value - 5, 0)
            else:
                cell.value = 0

    def save_and_upload(self):
        self.wb.save('Recipes.xlsx')
        self.wb.close()

        # file_id = 'your_google_drive_file_id_here'  # Replace with your actual file ID
        # media = MediaIoBaseUpload('Recipes.xlsx', resumable=True)
        # self.service.files().update(fileId=file_id, media_body=media).execute()

    def initialize(self):
        # self.get_google_drive_service()
        # self.download_file()
        self.load_workbook()