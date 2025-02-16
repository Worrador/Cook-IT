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
import { ScrollText, ChefHat, ArrowRight, Pencil, Trash2 } from 'lucide-react';

const RecipeDetailsDialog = ({ recipe, isOpen, setIsOpen, onNext, onCook, onUncook, onCommentChange, onDelete }) => {
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
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

  const handleNext = () => {
    setIsEditingComment(false);
    setHasClickedCook(false);
    onNext && onNext();
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            <ScrollText className="h-5 w-5" />
            How about this recipe?
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium">Name</Label>
            <div className="col-span-3 text-sm">
              {recipe.name}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium">Comment</Label>
            <div className="col-span-3">
              {isEditingComment ? (
                <div className="flex gap-2">
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
                  className="text-sm cursor-pointer hover:bg-[#f7f0e2] p-2 rounded-md flex items-center gap-2 group"
                >
                  <div className="flex-grow">
                    {commentText || (
                      <span className="text-gray-400">Click to add comment...</span>
                    )}
                  </div>
                  <Pencil className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
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
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="w-full bg-red-400 hover:bg-red-500 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                I did not like this recipe
              </Button>
              <Button
                variant="outline"
                onClick={handleChangeMind}
                className="w-full border-[#3c2f1a] text-[#3c2f1a] hover:bg-[#f7f0e2] flex items-center gap-2"
              >
                I changed my mind
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeDetailsDialog;