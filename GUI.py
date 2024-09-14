import sys
import subprocess
import importlib.util

required_packages = [
    'openpyxl',
    'google-auth-oauthlib',
    'google-auth-httplib2',
    'google-api-python-client'
]

def is_package_installed(package_name):
    spec = importlib.util.find_spec(package_name)
    return spec is not None

def install_package(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

def check_and_install_packages():
    for package in required_packages:
        if not is_package_installed(package):
            print(f"Installing {package}...")
            install_package(package)
        else:
            print(f"{package} is already installed.")
    print("All required packages have been installed.")

# Run the package check and installation
check_and_install_packages()

import tkinter as tk
from tkinter import messagebox
import webbrowser
import threading
from Cook_IT import CookITLogic

class CookITApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Cook-IT")
        self.geometry("400x250")

        self.logic = CookITLogic()

        self.create_widgets()

        # Start loading data in a separate thread
        threading.Thread(target=self.load_data, daemon=True).start()

    def create_widgets(self):
        self.label = tk.Label(self, text="Welcome to Cook-IT!")
        self.label.pack(pady=20)

        self.status_label = tk.Label(self, text="Loading data...")
        self.status_label.pack(pady=10)

        self.choose_button = tk.Button(self, text="Choose Recipe", command=self.choose_recipe, state=tk.DISABLED)
        self.choose_button.pack(pady=10)

        self.quit_button = tk.Button(self, text="Quit", command=self.quit)
        self.quit_button.pack(pady=10)

    def load_data(self):
        try:
            self.logic.initialize()
            self.update_status("Ready to choose a recipe!")
            self.enable_choose_button()
        except FileNotFoundError:
            self.handle_missing_file()
        except Exception as e:
            self.update_status(f"Error: {str(e)}")



    def handle_missing_file(self):
        message = ("The 'Recipes.xlsx' file was not found. "
                   "Would you like to create it?")
        if messagebox.askyesno("File Not Found", message):
            self.logic.create_workbook()
            messagebox.showinfo("File Created",
                "An empty 'Recipes.xlsx' file has been created.\n"
                "Please fill it with recipies and restart the application.")
        else:
            self.update_status("Data loading cancelled. File not found.")

    def update_status(self, message):
        self.status_label.config(text=message)

    def enable_choose_button(self):
        self.choose_button.config(state=tk.NORMAL)

    def choose_recipe(self):
        recipe_name, url, chosen_row = self.logic.choose_recipe()
        if messagebox.askyesno("Recipe Chosen", f"Do you want to cook {recipe_name}?"):
            self.logic.update_recency(chosen_row)
            webbrowser.open(url)
            self.logic.save_and_upload()
        else:
            self.choose_recipe()  # Choose again if user says no

    def quit(self):
        if messagebox.askyesno("Quit", "Are you sure you want to quit?"):
            super().quit()

if __name__ == "__main__":
    app = CookITApp()
    app.mainloop()