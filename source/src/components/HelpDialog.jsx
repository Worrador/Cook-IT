import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';

const HelpDialog = ({ isOpen, setIsOpen }) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            How does Cook-IT work?
          </DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p>test</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;