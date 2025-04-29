import json
import sys
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
        self.offline_mode = False

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
                self.logic._handle_remote_sync()
                self.offline_mode = False
                # Notify about successful connection via stdout with special prefix
                self.send_status_update({"type": "connection_status", "offline": False})
            except Exception as e:
                self.offline_mode = True
                print(f"Drive thread error: {e}", file=sys.stderr)
                # Notify about offline status
                self.send_status_update({"type": "connection_status", "offline": True})

        self.drive_thread = threading.Thread(target=drive_worker, daemon=True)
        self.drive_thread.start()
        self.start_queue_consumer()

    def send_status_update(self, status):
        """Send a status update via stdout with a special prefix"""
        try:
            status_json = json.dumps(status)
            # Use a special prefix that Electron will recognize
            print(f"STATUS_UPDATE:{status_json}", flush=True)
        except Exception as e:
            print(f"Error sending status update: {e}", file=sys.stderr)

    def handle_request(self, request):
        try:
            action = request['action']

            if action == 'initialize':
                # Always try to load local file first
                local_file_exists = self.logic.load_local_file()

                # Quick check for connectivity and valid credentials
                self.offline_mode = not self.logic.get_google_drive_service()

                if self.offline_mode and not local_file_exists:
                    # Critical error: No connectivity, no credentials AND no local file
                    return {
                        "error": "No internet connection and no local recipe book found.",
                    }

                # Start background thread only if we're online
                drive_thread_started = False
                if not self.offline_mode:
                    try:
                        self.start_drive_thread()
                        drive_thread_started = True
                    except Exception as e:
                        print(f"Failed to start drive thread: {e}", file=sys.stderr)
                        self.offline_mode = True
                        # Continue in offline mode with local file

                self.initialized = True

                # Return a more explicit status response
                return {
                    "success": True,
                    "offline": self.offline_mode,
                    "statusPending": drive_thread_started  # Only pending if thread started
                }

            if action == 'get-connection-status':
                return {"offline": self.offline_mode}

            if action == 'choose-recipe':
                if not self.initialized:
                    return {"waiting": True}

                # Get suggested recipes from request
                suggested_recipes = request.get('suggested_recipes', [])

                recipe_name, url, comment, _ = self.logic.choose_recipe(suggested_recipes)
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
                    # In offline mode, we need to ensure we're just saving locally
                    if self.offline_mode:
                        self.logic.save_local_file_only()
                    else:
                        self.logic.save_and_upload()
                self.drive_queue.put(save)
                self.drive_queue.put(None)  # Signal thread to stop
                return {"success": True}

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            return {"error": str(e), "offline": self.offline_mode}

if __name__ == "__main__":
    bridge = AsyncCookITBridge()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            request = json.loads(line.strip())
            response = bridge.handle_request(request)

            # Only print a response if the handler didn't already print one
            if response is not None:
                print(json.dumps(response), flush=True)

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}", file=sys.stderr)
            print(json.dumps({"error": f"Invalid JSON: {e}"}), flush=True)
        except Exception as e:
            print(f"Unexpected error: {e}", file=sys.stderr)
            print(json.dumps({"error": f"Unexpected error: {e}"}), flush=True)