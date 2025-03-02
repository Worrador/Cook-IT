import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { ChefHat, Lock } from 'lucide-react';

const HelpDialog = ({ isOpen, setIsOpen }) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[525px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            <ChefHat className="h-6 w-6 text-primary" />
            How does Cook-IT work?
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 text-sm space-y-4">
          <p>
            <strong>Cook-IT helps you decide what to cook</strong> by suggesting recipes you haven't made in a while.
            No more "What should we eat tonight?" dilemmas!
          </p>

          <h3 className="font-bold text-base mt-4">🚀 Getting Started</h3>
          <p>
            When you first use Cook-IT, it automatically creates a recipe file in your Google Drive.
            If you've used Cook-IT before, it finds your existing recipe file and syncs it with your device.
          </p>

          <h3 className="font-bold text-base">📜 Adding Recipes</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>➕ Click "Add Recipe"</li>
            <li>📝 Enter a name (required)</li>
            <li>🌐 Add a URL to the recipe or a path to a local document (required)</li>
            <li>💬 Add optional comments or notes</li>
          </ul>

          <h3 className="font-bold text-base">🎲 Choosing What to Cook</h3>
          <p>
            Click "Choose Recipe" and Cook-IT suggests something based on how recently you've made each dish.
            Recipes you haven't cooked in a while are more likely to be picked.
          </p>

          <h3 className="font-bold text-base">📖 Managing Your Recipes</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>👀 View recipe details by clicking "Choose Recipe"</li>
            <li>✅ Mark recipes as "Cooked" when you make them</li>
            <li>✏️ Edit comments anytime</li>
            <li>🗑️ Delete recipes you no longer want</li>
            <li>🔍 Open recipe URLs in your browser with one click</li>
          </ul>

          <h3 className="font-bold text-base">💾 Saving Your Recipes</h3>
          <p>
            Your recipes are saved automatically. When you close Cook-IT, all changes are securely uploaded
            to your Google Drive, ensuring nothing is lost.
          </p>

          <p className="italic text-gray-500 mt-4 flex items-center gap-3">
            <Lock className="h-7 w-7 text-gray-500" />
            All your recipe data stays private in your own Google Drive account.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={() => setIsOpen(false)}
            className="w-full bg-[#E89260] hover:bg-[#CF8053] text-white"
          >
            Got it!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
