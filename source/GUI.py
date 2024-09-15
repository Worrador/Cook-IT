import tkinter as tk
from tkinter import messagebox, simpledialog
import webbrowser
import threading
from Cook_IT import CookITLogic

class CookITApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Cook-IT")
        self.geometry("400x300")

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

        self.add_button = tk.Button(self, text="Add Recipe", command=self.add_recipe, state=tk.DISABLED)
        self.add_button.pack(pady=10)

        self.quit_button = tk.Button(self, text="Quit", command=self.quit)
        self.quit_button.pack(pady=10)

    def load_data(self):
        try:
            self.logic.initialize()
            self.update_status("Ready to choose a recipe!")
            self.enable_buttons()
        except Exception as e:
            self.update_status(f"Error: {str(e)}")

    def update_status(self, message):
        self.status_label.config(text=message)

    def enable_buttons(self):
        self.choose_button.config(state=tk.NORMAL)
        self.add_button.config(state=tk.NORMAL)

    def choose_recipe(self):
        recipe_name, url, chosen_row = self.logic.choose_recipe()
        if recipe_name is None:
            messagebox.showinfo("No Recipes", "No recipes available. Please add some recipes first.")
            return
        if messagebox.askyesno("Recipe Chosen", f"Do you want to cook {recipe_name}?"):
            self.logic.update_recency(chosen_row)
            webbrowser.open(url)
            self.logic.save_and_upload()
        else:
            self.choose_recipe()  # Choose again if user says no

    def add_recipe(self):
        name = simpledialog.askstring("Add Recipe", "Enter recipe name:")
        if name:
            url = simpledialog.askstring("Add Recipe", "Enter recipe URL:")
            if url:
                self.logic.add_recipe(name, url)
                messagebox.showinfo("Recipe Added", f"Recipe '{name}' has been added successfully!")

    def quit(self):
        if messagebox.askyesno("Quit", "Are you sure you want to quit?"):
            super().quit()

if __name__ == "__main__":
    app = CookITApp()
    app.mainloop()