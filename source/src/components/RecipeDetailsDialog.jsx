import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { Label } from './label';
import { Input } from './input';
import { ChefHat, ArrowRight, Pencil, PenLine, Trash2, ThumbsUp, RefreshCcw } from 'lucide-react';

const RecipeDetailsDialog = ({ recipe, isOpen, setIsOpen, onNext, onCook, onUncook, onCommentChange, onDelete, onAllRecipesShown }) => {
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  const commentInputRef = useRef(null);

  useEffect(() => {
    if (recipe) {
      setCommentText(recipe.comment || '');
    }
  }, [recipe]);

  useEffect(() => {
    // Reset the cook state when dialog opens/closes
    if (!isOpen) {
      setHasClickedCook(false);
      setNoMoreRecipes(false);
    }
  }, [isOpen]);

  if (!recipe) return null;

  const handleCommentSave = async () => {
    try {
      await onCommentChange(recipe, commentText);
      setIsEditingComment(false);
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const handleChangeMind = () => {
    setHasClickedCook(false);
    onUncook(recipe);
    handleNext();
  };

  const handleCook = () => {
    window.electronAPI.openUrl(recipe.url);
    setHasClickedCook(true);
    onCook(recipe);
  };

  const handleNext = async () => {
    setIsEditingComment(false);
    setHasClickedCook(false);
    try {
      const nextRecipe = await onNext();
      if (nextRecipe && nextRecipe.empty) {
        setNoMoreRecipes(true);
        onAllRecipesShown && onAllRecipesShown();
      }
    } catch (error) {
      console.error('Error getting next recipe:', error);
    }
  };

  const handleCommentClick = () => {
    setIsEditingComment(true);
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCommentSave();
    }
    if (e.key === 'Escape') {
      setIsEditingComment(false);
      setCommentText(recipe.comment || '');
    }
  };

  const handleDelete = () => {
    onDelete(recipe);
    setIsEditingComment(false);
    setHasClickedCook(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] h-[285px] bg-[#fbf7f0]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            <span className="text-lg">📜</span>
            How about this recipe?
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <div className="grid grid-cols-12 items-center gap-4">
            <Label className="col-span-3 text-right font-medium">Name</Label>
            <div className="col-span-8 flex items-center">
              <div className="text-sm overflow-x-auto whitespace-nowrap custom-scrollbar max-w-[calc(100%-8px)] h-[38px] pt-2">
                {recipe.name}
              </div>
            </div>
            <div className="col-span-1 flex justify-end">
              <div onClick={handleDelete} className="cursor-pointer hover:bg-[#f7f0e2] p-2 rounded-md flex items-center group">
                <div className="group-hover:rotate-12 transition-all">🗑️</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 -mt-1">
            <Label className="col-span-3 text-right font-medium pt-3">Comment</Label>
            <div className="col-span-9 -ml-2">
              {isEditingComment ? (
                <div className="flex gap-2 w-full">
                  <Input
                    ref={commentInputRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleCommentSave}
                    className="text-sm"
                    placeholder="Add a comment..."
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  onClick={handleCommentClick}
                  className="text-sm cursor-pointer hover:bg-[#f7f0e2] p-2 rounded-md flex w-full h-[46px]"
                >
                  <div className="overflow-x-auto whitespace-nowrap custom-scrollbar flex-grow flex items-center overflow-y-hidden mr-2">
                    {commentText || (
                      <span className="text-gray-400">Click to add comment...</span>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center">
                    <div className="group-hover:hidden">✏️</div>
                    <div className="hidden group-hover:block">✍️</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="absolute bottom-0 left-0 right-0 p-6 flex gap-2">
          {!hasClickedCook ? (
            <>
              <Button
                className="w-full cardButtonBg2 text-white transition-colors group"
                variant="default"
                onClick={handleCook}
              >
                <div className="flex items-center transition-transform group-hover:scale-110 gap-2">
                  <ChefHat className="h-4 w-4" />
                  I will Cook IT!
                </div>
              </Button>
              <Button
                variant="outline"
                onClick={handleNext}
                className="border-[#3c2f1a] text-[#3c2f1a] hover:bg-[#f7f0e2] flex items-center gap-2"
                disabled={noMoreRecipes}
              >
                {noMoreRecipes ? "No more recipes" : "Next"}
                {!noMoreRecipes && <ArrowRight className="h-4 w-4" />}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={handleChangeMind}
              className="col-span-2 border-[#3c2f1a] text-[#3c2f1a] hover:bg-[#f7f0e2] flex items-center gap-2"
            >
              I changed my mind
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeDetailsDialog;