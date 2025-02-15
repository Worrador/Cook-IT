import json
import sys
from Cook_IT import CookITLogic
import webbrowser

logic = CookITLogic()

def handle_request(request):
    try:
        action = request['action']
        if action == 'initialize':
            print("Initializing CookIT Logic", file=sys.stderr, flush=True)
            logic.initialize()
            return {"success": True}
        elif action == 'choose-recipe':
            print("Choosing a recipe", file=sys.stderr, flush=True)
            recipe_name, url, comment, _ = logic.choose_recipe()
            if recipe_name is None:
                print("No recipe chosen", file=sys.stderr, flush=True)
                return {"empty": True}  # Return an object instead of None
            print(f"Chosen recipe - Name: {recipe_name}, URL: {url}", file=sys.stderr, flush=True)
            return {
                "name": recipe_name,
                "url": url,
                "comment": comment
            }
        elif action == 'add-recipe':
            recipe = request['recipe']
            print(f"Adding recipe - Name: {recipe['name']}, URL: {recipe['url']}", file=sys.stderr, flush=True)
            logic.add_recipe(recipe['name'], recipe['url'], recipe['comment'])
            return {"success": True}
        elif action == 'update-comment':
            recipe = request['recipe']
            comment = request['comment']
            print(f"Updating comment for recipe '{recipe['name']}' from '{recipe['comment']}' to '{comment}'", file=sys.stderr, flush=True)
            logic.update_recipe_comment(recipe['name'], recipe['url'], recipe['comment'], comment)
            return {"success": True}
        elif action == 'open-url':
            url = request['url']
            print(f"Opening URL: {url}", file=sys.stderr, flush=True)
            webbrowser.open(url)
            return {"success": True}
        elif action == 'update-recency':
            cooked_recipes = request['cookedRecipes']
            recipe_names = [recipe['name'] for recipe in cooked_recipes]
            print(f"Updating recency for recipes: {', '.join(recipe_names)}", file=sys.stderr, flush=True)
            logic.update_recency(recipe_names)
            return {"success": True}
        elif action == 'delete-recipe':
            recipe = request['recipe']
            print(f"Deleting recipe - Name: {recipe['name']}, Comment: {recipe['comment']}", file=sys.stderr, flush=True)
            logic.delete_recipe(recipe['name'], recipe['comment'])
            return {"success": True}
        elif action == 'quit':
            print("Saving and uploading data", file=sys.stderr, flush=True)
            logic.save_and_upload()
            return {"success": True}
    except Exception as e:
        print(f"Exception occurred - {str(e)}", file=sys.stderr, flush=True)
        return {"error": str(e)}

if __name__ == "__main__":
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            request = json.loads(line.strip())
            print(f" Processing request - Action: {request.get('action', 'Unknown')}", file=sys.stderr, flush=True)
            response = handle_request(request)
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"Unexpected error: {str(e)}"}), flush=True)