import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog.jsx";
import { Coffee } from 'lucide-react';
import { Button } from './button.jsx';

const BuyCoffeeDialog = ({ isOpen, setIsOpen }) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="h-6 w-6 text-[#6B4F37]" />
            Buy me a Coffee
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600 mb-4">
            If you're enjoying Cook-IT, consider supporting its development!
          </p>
          <Button
            className="w-full bg-[#6B4F37] hover:bg-[#A37B58] text-white"
            onClick={() => window.electronAPI.openExternal('https://ko-fi.com/worrador')}
          >
            <Coffee className="mr-2 h-4 w-4" />
            Support Cook-IT
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuyCoffeeDialog;