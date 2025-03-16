import React, { useState, useEffect, useRef  } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from './components/card.jsx';
import { Button } from './components/button.jsx';
import { Input } from './components/input.jsx';
import RecipeDetailsDialog from './components/RecipeDetailsDialog.jsx';
import HelpDialog from './components/HelpDialog.jsx';
import BuyCoffeeDialog from './components/BuyCoffeeDialog.jsx';
import { Loader2, ChefHat, PlusCircle, X, BookOpen, HelpCircle, Coffee, WifiOff, BookX } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "./components/dialog.jsx";
import { Label } from "./components/label.jsx";
import './CookITApp.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


const showToast = (message, type = 'info', onCloseCallback = () => {}) => {
  const duration = Math.max(message.length * 60 + 300, 1000);
  toast[type](message, {
    autoClose: duration,
    onClose: onCloseCallback, // Trigger the callback when the toast is closed
  });
};

const CookITApp = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const [isRecipeDetailsOpen, setIsRecipeDetailsOpen] = useState(false);
  const [chosenRecipe, setChosenRecipe] = useState(null);
  const firstInputRef = useRef(null); // Ref for the first input
  const [cookedRecipes, setCookedRecipes] = useState(new Map());
  const [showHelp, setShowHelp] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showBuyCoffee, setShowBuyCoffee] = useState(false);
  const [isBuyCoffeeOpen, setIsBuyCoffeeOpen] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const [tutorialCount, setTutorialCount] = useState(0);
  const [showOfflineIcon, setShowOfflineIcon] = useState(false);
  const [criticalError, setCriticalError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (criticalError && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (criticalError && countdown === 0) {
      window.close();
    }
  }, [criticalError, countdown]);

  useEffect(() => {
    if (isAddRecipeOpen && firstInputRef.current) {
      firstInputRef.current.focus(); // Focus the input when dialog opens
    }
  }, [isAddRecipeOpen]);

  useEffect(() => {
    const initApp = async () => {
      let initialOfflineMode = false;
      try {
        const response = await window.electronAPI.initialize();

        // Set initial offline state
        initialOfflineMode = response && response.offline;

        // Register for status updates if status is pending
        if (response && response.statusPending) {
          window.electronAPI.onConnectionStatusUpdate((status) => {
            if (status.type === "connection_status") {
              // For state updates, first show toast, then update UI
              if (status.offline) {
                showToast("No internet connection. Working with local recipes only.", "warning", () => {
                  setIsOffline(true);
                  setShowOfflineIcon(true);
                });
              } else if (!status.offline && isOffline) {
                showToast("Connected to Google Drive. Syncing recipes.", "success", () => {
                  setIsOffline(false);
                  setShowOfflineIcon(false);
                });
              }
            }
          });
        }
      } catch (error) {
        console.error('Initialization error:', error.message);
        let cleanErrorMessage = error.message;

        // Extract only the part after "Error:"
        if (cleanErrorMessage.includes("Error:")) {
          cleanErrorMessage = cleanErrorMessage.split("Error:")[1].trim();
        }

        setErrorMessage(cleanErrorMessage);
        setCriticalError(true);
        setCountdown(1000);
      }

      // Load the tutorial counter from localStorage
      const savedTutorialCount = localStorage.getItem('cookItTutorialCount');

      // If it doesn't exist yet or is less than 40, we should show the help button
      if (savedTutorialCount === null || parseInt(savedTutorialCount) < 140) {
        setShowHelp(true);

        // Initialize or increment the counter
        const newCount = savedTutorialCount === null ? 1 : parseInt(savedTutorialCount) + 1;
        setTutorialCount(newCount);

        // Save the new count to localStorage
        localStorage.setItem('cookItTutorialCount', newCount.toString());
      }

      // Set loading to false before showing offline toast
      setIsLoading(false);

      if (initialOfflineMode) {
        showToast("No internet connection. Working with local recipes only.", "warning", () => {
          // Only show offline icon after toast notification completes
          setIsOffline(true);
          setShowOfflineIcon(true);
        });
      }
    };
    initApp();
  }, []);

  const handleChooseRecipe = async () => {
    try {
      const recipe = await window.electronAPI.chooseRecipe();
      if (recipe.empty) {
        showToast("Recipe book is empty, please add a few recipes first!", "info", () => {
          setShowHelp(true);
        });
        return;
      }
      setChosenRecipe(recipe);
      setIsRecipeDetailsOpen(true);
    } catch (error) {
      console.error('Error choosing recipe:', error);
      showToast('Error choosing recipe: ' + error.message, "error");
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
      alert('Error updating comment: ' + error.message, "error");
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
      showToast('Recipe added successfully!', "success");
    } catch (error) {
      console.error('Error adding recipe:', error);
      showToast('Error adding recipe: ' + error.message, "error");
    }
  };

  const handleQuit = async () => {
    try {
      // Show saving notification first
      const savingToast = toast.info(isOffline ? "Saving changes locally..." : "Saving changes to Drive...", {
        autoClose: false, // Don't auto close this one
        closeButton: false // Prevent manual closing
      });

      // Set quitting state
      setIsQuitting(true);

      // Perform save operations
      await window.electronAPI.updateRecency(Array.from(cookedRecipes.values()));

      // Dismiss toast and fade out
      toast.dismiss(savingToast);
      document.body.style.opacity = '0';
      document.body.style.transition = 'opacity 0.75s ease';

      // Wait for fade animation and then quit
      setTimeout(async () => {
        await window.electronAPI.quit();
      }, 750);

    } catch (error) {
      console.error('Error saving changes:', error);
      setIsQuitting(false);
      showToast('Error saving changes: ' + error.message, "error");
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

    const currentCount = parseInt(localStorage.getItem('cookItClickCount') || '0');
    const newCount = (currentCount + 1) % 5;
    localStorage.setItem('cookItClickCount', newCount.toString());
    setShowBuyCoffee(newCount % 5 === 0);
  };

  const handleUncook = (recipe) => {
    setCookedRecipes(prev => {
      const updated = new Map(prev);
      updated.delete(recipe.name);
      return updated;
    });
  };

const handleDelete = async (recipe) => {
  try {
    await window.electronAPI.deleteRecipe(recipe);
    setCookedRecipes(prev => {
      const updated = new Map(prev);
      updated.delete(recipe.name);
      return updated;
    });

    // Choose new recipe without closing the dialog
    const newRecipe = await window.electronAPI.chooseRecipe();
    if (newRecipe.empty) {
      setIsRecipeDetailsOpen(false);
      showToast("No more recipes in the recipe book!", "error");
      return;
    }
    showToast('Successfully deleted recipe: ' + recipe.name, "success");
    setChosenRecipe(newRecipe);
  } catch (error) {
    console.error('Error deleting recipe:', error);
    showToast('Failed to delete recipe: ' + error.message, "error");
  }
};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="mr-2 h-16 w-16 animate-spin" />
        <p className="text-xl font-semibold">Loading Cook-IT...</p>
      </div>
    );
  }

  if (criticalError) {
    return (
      <div className="container mx-auto p-4">
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-16 mb-4">
              <WifiOff className="h-16 w-16 text-red-500" />
              <BookX className="h-16 w-16 text-red-500" />
            </div>
            <p className="text-xl font-semibold text-center mt-4">{errorMessage}</p>
            <p className="text-md text-center mt-2">Please connect to the internet and restart the application.</p>
            <p className="text-sm text-gray-500 mt-4">
              Application will close automatically in {countdown} seconds...
            </p>
          </CardContent>
          <CardFooter className="mt-2">
            <Button
              variant="default"
              className="w-full bg-red-400 hover:bg-red-500"
              onClick={() => window.close()}
            >
              Close Now
            </Button>
          </CardFooter>
        </Card>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 border-transparent">
      <Card className="w-full max-w-md mx-auto border-transparent relative">
        <CardHeader>
          <div className="flex items-center justify-center">
            <ChefHat className="h-12 w-12 text-primary headerItems" />
            <h1 className="text-3xl font-bold ml-2 headerItems">Cook-IT</h1>
            {showOfflineIcon && (
              <div className="absolute right-4 transition-opacity duration-300">
                <WifiOff className="h-5 w-5 text-amber-500" title="Offline Mode" />
              </div>
            )}
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
            <DialogContent className="sm:max-w-[425px] bg-[#fbf7f0]">
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
        {showHelp && (
          <Button
            className="absolute left-0 right-0 flex items-center justify-center cursor-pointer z-10 group bg-transparent border-none"
            style={{ bottom: "72px", left: "50%", transform: "translateX(-50%)"}}
            onClick={() => setIsHelpOpen(true)}
          >
            <div className="flex items-center gap-1 text-[#6B4F37] transition-colors group-hover:text-[#A37B58]">
              <span className="text-xs font-bold">How does IT work</span>
              <HelpCircle className="h-4 w-4 font-bold text-[#6B4F37] group-hover:text-[#A37B58]" />
            </div>
          </Button>
        )}
        {showBuyCoffee && !showHelp && (
          <Button
            className="absolute flex items-center justify-center cursor-pointer z-10 group bg-transparent border-none"
            style={{ bottom: "72px", left: "50%", transform: "translateX(-50%)"}}
            onClick={() => window.electronAPI.openUrl('https://ko-fi.com/worrador')}
          >
            <div className="flex items-end gap-1 text-[#6B4F37] transition-colors group-hover:text-[#A37B58]">
              <Coffee className="h-3 w-3 font-bold text-[#6B4F37] group-hover:text-[#A37B58]" />
              <span className="text-[9px] font-bold leading-none flex items-end" style={{ transform: 'translateY(-2px)' }}>
                Buy me a Coffee :)
              </span>
            </div>
          </Button>
        )}
        <CardFooter className="mt-8">
          <Button
            variant="default"
            className={`w-full cardQuitBtn group transition-transform hover:bg-[#4c8ca4] ${
              isQuitting && '!bg-[#4c8ca4]'
            }`}
            onClick={handleQuit}
          >
            <X
              className={`mr-2 h-4 w-4 transition-transform ${
                isQuitting ? 'scale-125 animate-fast-spin' : 'group-hover:rotate-180 group-hover:scale-125'
              }`}
            />
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
      onDelete={handleDelete}
    />
    <ToastContainer
      toastClassName="toast-rounded"
      position="top-center"
      autoClose={4000}  // Set a longer default duration - 4 seconds
      hideProgressBar={true}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      closeButton={false}
      style={{
        zIndex: 9999,
        top: '10%',
        maxWidth: '300px',
        left: '50%',
        transform: 'translateX(-50%)',
      }}
      className="toast-animation"
    />
    <HelpDialog isOpen={isHelpOpen} setIsOpen={setIsHelpOpen} />
    <BuyCoffeeDialog isOpen={isBuyCoffeeOpen} setIsOpen={setIsBuyCoffeeOpen} />
    </div>
  );
};

export default CookITApp;