import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { ChefHat, Lock, Lightbulb, Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';

const HelpDialog = ({ isOpen, setIsOpen, isRecipeBookEmpty, onSampleRecipesAdded }) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[78vh] overflow-y-auto bg-[#fbf7f0] custom-scrollbar" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl text-[#181818] font-bold">
            <ChefHat className="h-8 w-8 text-[#181818]" />
            How does Cook-IT work?
          </DialogTitle>
        </DialogHeader>
        <div className="pt-4 text-sm text-[#6B4F37]">
          <p className="bg-[#FBE7A0] p-3 rounded-lg shadow-md">
            <strong className="text-[#6B4F37]">Cook-IT helps you decide what to cook</strong> by suggesting recipes you haven't made in a while.
            No more "What should we eat tonight?" dilemmas!
          </p>

          <h3 className="font-bold text-base mt-4 text-[#E06D3D] flex items-center -ml-[14px]">
            <span className="bg-[#F2BC42] p-1 rounded-full mr-2 text-white">🚀</span>
            Getting Started
          </h3>
          <p className="pl-3 border-l-2 border-[#F2BC42] -mr-[12px]">
            When you first use Cook-IT, it automatically creates a recipe file in your Google Drive.
            If you've used Cook-IT before, it finds your existing recipe file and syncs it with your device.
          </p>

          <h3 className="font-bold text-base text-[#E06D3D] flex items-center pt-4 -ml-[14px]">
            <span className="bg-[#F2BC42] p-1 rounded-full mr-2 text-white">📜</span>
            Adding Recipes
          </h3>
          <ul className="list-none pl-3 space-y-2 border-l-2 border-[#F2BC42]">
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2">➕</span> Click <strong>"Add Recipe"</strong></li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2">📝</span> Enter a name</li>
            <li className="flex items-center -mr-[12px]"><span className="text-[#E06D3D] mr-2">🌐</span> Add a web URL to the recipe or just a path to a local file (e.g: C:\Documents\Recipe.pdf)</li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2">💬</span> Add optional comments or notes (e.g: Use more water)</li>
          </ul>

          <h3 className="font-bold text-base text-[#E06D3D] flex items-center pt-4 -ml-[14px]">
            <span className="bg-[#F2BC42] p-1 rounded-full mr-2 text-white text-[18px]">🎲</span>
            Choosing What to Cook
          </h3>
          <p className="pl-3 border-l-2 border-[#F2BC42] -mr-[12px]">
            Click <strong>"Choose Recipe"</strong> and Cook-IT suggests something based on how recently you've made each dish.
            Recipes you haven't cooked in a while are more likely to be picked.
          </p>

          <h3 className="font-bold text-base text-[#E06D3D] flex items-center pt-4 -ml-[14px]">
            <span className="bg-[#F2BC42] p-1 rounded-full mr-2 text-white">📖</span>
            Managing Your Recipes
          </h3>

          <p className="pl-3 border-l-2 border-[#F2BC42] -mr-[12px]">
            After you get a suggestion you have the options to:
          </p>
          <ul className="list-none pl-3 space-y-2 border-l-2 border-[#F2BC42]">
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2 mt-2">🗑️</span> Delete recipes you no longer want</li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2">✏️</span> Edit comments anytime</li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2.5 text-lg font-bold">➔</span> Navigate to the next recipe suggestion by clicking "Next"</li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2">👀</span> View recipe details by clicking "I will Cook IT!". The app will remember your choice</li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-2.5 text-lg font-bold">↺</span> You then will have the option to undo your choice</li>
            <li className="flex items-center"><span className="text-[#E06D3D] mr-1.5">📌</span> Or save the recipe to the homescreen"</li>
          </ul>

          <div className="bg-[#FBE7A0] p-3 rounded-lg mt-4 flex items-center gap-3 shadow-md">
            <Lightbulb className="h-24 w-24 text-[#6B4F37]" />
            <p className="italic text-[#6B4F37]">
              Tip: By clicking "I will Cook IT!" you will have the chance to create your shopping list. And by saving the recipe to the homescreen, the next time you open the app, you can open the recipe again for the actual cooking instructions.
            </p>
          </div>

          <h3 className="font-bold text-base text-[#E06D3D] flex items-center pt-4 -ml-3">
            <span className="bg-[#F2BC42] p-1 rounded-full mr-2 text-white">💾</span>
            Saving Your Recipes
          </h3>
          <p className="pl-3 border-l-2 border-[#F2BC42] -mr-[12px]">
            Your new or modified recipes are saved automatically. When you close Cook-IT, all changes are securely uploaded
            to your Google Drive, ensuring nothing is lost.
          </p>

          <div className="bg-[#FBE7A0] p-3 rounded-lg mt-4 flex items-center gap-3 shadow-md">
            <Lock className="h-8 w-8 text-[#6B4F37]" />
            <p className="italic text-[#6B4F37]">
              All your recipe data stays private in your own Google Drive account.
            </p>
          </div>

          {isRecipeBookEmpty && (
            <div className="bg-[#FBE7A0] p-3 rounded-lg mt-4 flex items-center gap-3 shadow-md">
              <Sparkles className="h-16 w-16 text-[#6B4F37]" />
              <p className="text-[#6B4F37]">
                Since your recipe book is empty, would you like to quick-fill it with some sample recipes hand-picked by our development team?
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="pt-4">
          {isRecipeBookEmpty ? (
            <div className="flex gap-2 w-full">
              <Button
                onClick={async () => {
                  try {
                    await window.electronAPI.addSampleRecipes();
                    toast.success("Sample recipes have been added to your recipe book!", {
                      position: "top-center",
                      autoClose: 3000,
                      hideProgressBar: true,
                      closeOnClick: true,
                      pauseOnHover: true,
                      draggable: true,
                    });
                    onSampleRecipesAdded();
                    setIsOpen(false);
                  } catch (error) {
                    console.error('Error adding sample recipes:', error);
                    toast.error("Failed to add sample recipes. Please try again.", {
                      position: "top-center",
                      autoClose: 3000,
                      hideProgressBar: true,
                      closeOnClick: true,
                      pauseOnHover: true,
                      draggable: true,
                    });
                  }
                }}
                className="group w-1/2 cardButtonBg text-white font-bold py-2 uppercase"
              >
                <div className="flex items-center justify-center transition-transform group-hover:scale-110">
                  Yes, please!
                </div>
              </Button>
              <Button
                onClick={() => setIsOpen(false)}
                className="group w-1/2 bg-[#6B4F37] text-[#f7f0e2] font-bold py-2 uppercase"
              >
                <div className="flex items-center justify-center transition-transform group-hover:scale-110">
                  No, I'll do it myself
                </div>
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setIsOpen(false)}
              className="group w-full bg-[#6B4F37] text-[#f7f0e2] font-bold py-2 uppercase"
            >
              <div className="flex items-center transition-transform group-hover:scale-110">
                Got it!
              </div>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f4eadc;
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #F2BC42;
          border-radius: 10px;
          border: 2px solid #f4eadc;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #E06D3D;
          cursor: pointer;
        }
      `}</style>
    </Dialog>
  );
};

export default HelpDialog;