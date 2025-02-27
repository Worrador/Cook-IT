import json
import sys
import asyncio
import threading
from queue import Queue
from Cook_IT import CookITLogic
import webbrowser

class AsyncCookITBridge:
    def __init__(self):
        self.logic = CookITLogic()
        self.drive_queue = Queue()
        self.initialized = False
        self.drive_thread = None
        self.queue_thread = None


    def start_queue_consumer(self):
        def queue_worker():
            while True:
                try:
                    # Get task from queue (blocks until an item is available)
                    task = self.drive_queue.get()

                    # None is used as a signal to stop
                    if task is None:
                        break
                    task()
                    self.drive_queue.task_done()
                except Exception as e:
                    print(f"Queue worker error: {e}", file=sys.stderr)

        self.queue_thread = threading.Thread(target=queue_worker, daemon=True)
        self.queue_thread.start()

    def start_drive_thread(self):
        def drive_worker():
            try:
                self.logic.get_google_drive_service()
                self.logic._handle_remote_sync()
            except Exception as e:
                print(f"Drive thread error: {e}", file=sys.stderr)

        self.drive_thread = threading.Thread(target=drive_worker, daemon=True)
        self.drive_thread.start()
        self.start_queue_consumer()

    def handle_request(self, request):
        try:
            action = request['action']

            if action == 'initialize':
                if not self.drive_thread:
                    self.logic.load_local_file()  # Try local first
                    self.start_drive_thread()     # Start background sync
                    self.initialized = True
                return {"success": True}

            if action == 'choose-recipe':
                if not self.initialized:
                    return {"waiting": True}

                recipe_name, url, comment, _ = self.logic.choose_recipe()
                if recipe_name is None:
                    return {"empty": True}

                return {
                    "name": recipe_name,
                    "url": url,
                    "comment": comment
                }

            if action == 'add-recipe':
                recipe = request['recipe']
                def add():
                    self.logic.add_recipe(recipe['name'], recipe['url'], recipe['comment'])
                self.drive_queue.put(add)
                return {"success": True}

            if action == 'update-comment':
                recipe = request['recipe']
                comment = request['comment']
                def update():
                    self.logic.update_recipe_comment(
                        recipe['name'], recipe['url'],
                        recipe['comment'], comment
                    )
                self.drive_queue.put(update)
                return {"success": True}

            if action == 'open-url':
                webbrowser.open(request['url'])
                return {"success": True}

            if action == 'update-recency':
                recipe_names = [r['name'] for r in request['cookedRecipes']]
                def update():
                    self.logic.update_recency(recipe_names)
                self.drive_queue.put(update)
                return {"success": True}

            if action == 'delete-recipe':
                recipe = request['recipe']
                def delete():
                    self.logic.delete_recipe(recipe['name'], recipe['comment'])
                self.drive_queue.put(delete)
                return {"success": True}

            if action == 'quit':
                def save():
                    self.logic.save_and_upload()
                self.drive_queue.put(save)
                self.drive_queue.put(None)  # Signal thread to stop
                return {"success": True}

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            return {"error": str(e)}

if __name__ == "__main__":
    bridge = AsyncCookITBridge()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            request = json.loads(line.strip())
            response = bridge.handle_request(request)
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON: {e}"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"Unexpected error: {e}"}), flush=True)