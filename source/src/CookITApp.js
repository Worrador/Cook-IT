import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from './components/card.jsx';
import { Button } from './components/button.jsx';
import { Input } from './components/input.jsx';
import { Loader2, ChefHat, PlusCircle, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog.jsx";
import { Label } from "./components/label.jsx";
import './CookITApp.css';

const CookITApp = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });

  useEffect(() => {
    window.electronAPI.initialize().then(() => setIsLoading(false));
  }, []);

  const handleChooseRecipe = async () => {
    try {
      const recipe = await window.electronAPI.chooseRecipe();
      alert(`Recipe chosen: ${recipe.name}\nURL: ${recipe.url}\nComment: ${recipe.comment}`);
    } catch (error) {
      console.error('Error choosing recipe:', error);
      alert('Error choosing recipe: ' + error.message);
    }
  };

  const handleAddRecipe = async () => {
    try {
      await window.electronAPI.addRecipe(newRecipe);
      setIsAddRecipeOpen(false);
      setNewRecipe({ name: '', url: '', comment: '' });
      alert('Recipe added successfully!');
    } catch (error) {
      console.error('Error adding recipe:', error);
      alert('Error adding recipe: ' + error.message);
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

  return (
    <div className="container mx-auto p-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <div className="flex items-center justify-center">
            <ChefHat className="h-12 w-12 text-primary" />
            <h1 className="text-3xl font-bold ml-2">Cook-IT</h1>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={handleChooseRecipe}>
            Choose Recipe
          </Button>
          <Dialog open={isAddRecipeOpen} onOpenChange={setIsAddRecipeOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Recipe
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Recipe</DialogTitle>
                <DialogDescription>
                  Enter the details of your new recipe here.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={newRecipe.name}
                    onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })}
                    className="col-span-3"
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
                    className="col-span-3"
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
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddRecipe}>Add Recipe</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => window.close()}>
            <X className="mr-2 h-4 w-4" /> Quit
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default CookITApp;