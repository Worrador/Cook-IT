import React, { useState, useEffect, useRef  } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from './components/card.jsx';
import { Button } from './components/button.jsx'; // Make sure this imports the updated Button component
import { Input } from './components/input.jsx';
import RecipeDetailsDialog from './components/RecipeDetailsDialog.jsx';
import { Loader2, ChefHat, PlusCircle, X, BookOpen} from 'lucide-react';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog.jsx";
import { Label } from "./components/label.jsx";
import './CookITApp.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const CookITApp = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const [isRecipeDetailsOpen, setIsRecipeDetailsOpen] = useState(false);
  const [chosenRecipe, setChosenRecipe] = useState(null);
  const firstInputRef = useRef(null); // Ref for the first input
  const [cookedRecipes, setCookedRecipes] = useState(new Map());

  useEffect(() => {
    if (isAddRecipeOpen && firstInputRef.current) {
      firstInputRef.current.focus(); // Focus the input when dialog opens
    }
  }, [isAddRecipeOpen]);

  useEffect(() => {
    window.electronAPI.initialize().then(() => setIsLoading(false));
  }, []);

  const handleChooseRecipe = async () => {
    try {
      const recipe = await window.electronAPI.chooseRecipe();
      setChosenRecipe(recipe);
      setIsRecipeDetailsOpen(true);
    } catch (error) {
      console.error('Error choosing recipe:', error);
      alert('Error choosing recipe: ' + error.message);
    }
  };

  const handleCommentChange = async (recipe, newComment) => {
    try {
      // Update the comment in the chosen recipe
      setChosenRecipe({
        ...recipe,
        comment: newComment
      });

      // You'll need to add this endpoint to your Python backend
      await window.electronAPI.updateComment(recipe, newComment);
    } catch (error) {
      console.error('Error updating comment:', error);
      alert('Error updating comment: ' + error.message);
    }
  };

  const handleNext = async () => {
    await handleChooseRecipe();
  };

  const handleAddRecipe = async () => {
    try {
      await window.electronAPI.addRecipe(newRecipe);
      setIsAddRecipeOpen(false);
      setNewRecipe({ name: '', url: '', comment: '' });
      toast.success('Recipe added successfully!');
    } catch (error) {
      console.error('Error adding recipe:', error);
      toast.error('Error adding recipe: ' + error.message);
    }
  };

  const handleQuit = async () => {
    try {
      await window.electronAPI.updateRecency(Array.from(cookedRecipes.values()));
      document.body.style.opacity = '0';
      await window.electronAPI.quit();
      window.close();
      toast.success('Changes saved to Drive');
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error('Error saving changes: ' + error.message);
    }
  };

  const handleCook = (recipe) => {
    setCookedRecipes(prev => {
      const updated = new Map(prev);
      updated.set(recipe.name, {
        name: recipe.name,
        comment: recipe.comment
      });
      return updated;
    });
  };

  const handleUncook = (recipe) => {
    setCookedRecipes(prev => {
      const updated = new Map(prev);
      updated.delete(recipe.name);
      return updated;
    });
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="mr-2 h-16 w-16 animate-spin" />
        <p className="text-xl font-semibold">Loading Cook-IT...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 border-transparent">
      <Card className="w-full max-w-md mx-auto border-transparent">
        <CardHeader>
          <div className="flex items-center justify-center">
            <ChefHat className="h-12 w-12 text-primary headerItems" />
            <h1 className="text-3xl font-bold ml-2 headerItems">Cook-IT</h1>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 mb-5">
          <Button className="w-full cardButtonBg text-white transition-colors group" variant="default" onClick={handleChooseRecipe}>
            <div className="flex items-center transition-transform group-hover:scale-110">
              <BookOpen className="mr-2 h-5 w-5" />
              <span>Choose Recipe</span>
            </div>
          </Button>
          <Dialog
            open={isAddRecipeOpen}
            onOpenChange={(open) => {
              setIsAddRecipeOpen(open);
              if (open) {
                // Ensure focus is set when dialog opens
                setTimeout(() => {
                  firstInputRef.current?.focus();
                }, 0); // Use a timeout to wait for the dialog to fully render
              } else {
                setNewRecipe({ name: '', url: '', comment: '' });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="w-full addNewRecipeBtnEnabled text-white group" variant="default">
                <div className="flex items-center transition-transform group-hover:scale-110">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Recipe
                </div>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Recipe</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    ref={firstInputRef} // Attach the ref here
                    value={newRecipe.name}
                    onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })}
                    className={`col-span-3 border-transparent focus:outline-none focus:ring-0 focus:border-orange-500 border-2 addRecipeInputColor ${
                      newRecipe.name ? 'addRecipeWritten' : 'addRecipeEmpty'
                    }`}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="url" className="text-right">
                    URL
                  </Label>
                  <Input
                    id="url"
                    value={newRecipe.url}
                    onChange={(e) => setNewRecipe({ ...newRecipe, url: e.target.value })}
                    className={`col-span-3 border-transparent focus:outline-none focus:ring-0 focus:border-orange-500 focus:border-2 addRecipeInputColor ${
                      newRecipe.url ? 'addRecipeWritten' : 'addRecipeEmpty'
                    }`}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="comment" className="text-right">
                    Comment
                  </Label>
                  <Input
                    id="comment"
                    value={newRecipe.comment}
                    onChange={(e) => setNewRecipe({ ...newRecipe, comment: e.target.value })}
                    className={`col-span-3 border-transparent focus:outline-none focus:ring-0 focus:border-orange-500 border-2 addRecipeInputColor ${
                      newRecipe.comment ? 'addRecipeWritten' : 'addRecipeEmpty'
                    }`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  className={`addNewRecipeBtn ${
                    newRecipe.name && newRecipe.url ? 'addNewRecipeBtnEnabled' : 'addNewRecipeBtnDisabled'
                  }`}
                  variant="default"
                  onClick={handleAddRecipe}
                  disabled={!(newRecipe.name && newRecipe.url)}
                >
                  Add Recipe
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
        <CardFooter>
          <Button
            variant="default"
            className="w-full cardQuitBtn hover:bg-[#4c8ca4] group transition-transform"
            onClick={handleQuit}>
            <X className="mr-2 h-4 w-4 transition-transform group-hover:rotate-180 group-hover:scale-125" />
            Quit
          </Button>

        </CardFooter>
      </Card>

    <RecipeDetailsDialog
      recipe={chosenRecipe}
      isOpen={isRecipeDetailsOpen}
      setIsOpen={setIsRecipeDetailsOpen}
      onNext={handleNext}
      onCook={handleCook}
      onUncook={handleUncook}
      onCommentChange={handleCommentChange}
    />
    <ToastContainer
      position="top-center"
      autoClose={1000}
      hideProgressBar={true}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      closeButton={false} // Hide the close button
      style={{
        zIndex: 9999, // Ensure it's above other content
        top: '10%', // Adjust vertical position
        maxWidth: '300px', // Limit the width of the popup
        left: '50%',
        transform: 'translateX(-50%)', // Ensure centering is perfect
      }}
      className="toast-animation" // Custom class for animation
    />

    </div>
  );
};

export default CookITApp;
