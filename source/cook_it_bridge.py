import sys
import json
from Cook_IT import CookITLogic

logic = CookITLogic()

def handle_request(request):
    action = request['action']
    if action == 'initialize':
        logic.initialize()
        return json.dumps({"success": True})
    elif action == 'choose-recipe':
        recipe_name, url, comment, _ = logic.choose_recipe()
        if recipe_name is None:
            return json.dumps(None)
        return json.dumps({
            "name": recipe_name,
            "url": url,
            "comment": comment
        })
    elif action == 'add-recipe':
        recipe = request['recipe']
        logic.add_recipe(recipe['name'], recipe['url'], recipe['comment'])
        logic.save_and_upload()
        return json.dumps({"success": True})

if __name__ == "__main__":
    while True:
        try:
            request = json.loads(input())
            response = handle_request(request)
            print(response, flush=True)
        except EOFError:
            break