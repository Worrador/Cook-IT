import json
import sys
from Cook_IT import CookITLogic

logic = CookITLogic()

def handle_request(request):
    try:
        action = request['action']
        if action == 'initialize':
            logic.initialize()
            return {"success": True}
        elif action == 'choose-recipe':
            recipe_name, url, comment, _ = logic.choose_recipe()
            if recipe_name is None:
                return None
            return {
                "name": recipe_name,
                "url": url,
                "comment": comment
            }
        elif action == 'add-recipe':
            recipe = request['recipe']
            logic.add_recipe(recipe['name'], recipe['url'], recipe['comment'])
            logic.save_and_upload()
            return {"success": True}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            request = json.loads(line.strip())
            print("DEBUG: Processing request", file=sys.stderr, flush=True)
            response = handle_request(request)
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"Unexpected error: {str(e)}"}), flush=True)