import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChefHat, PlusCircle, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const { electronAPI } = window;

const CookITApp = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const { toast } = useToast();

  useEffect(() => {
    electronAPI.initialize()
      .then(() => setIsLoading(false))
      .catch(error => {
        console.error('Initialization error:', error);
        toast({
          title: "Error",
          description: "Failed to initialize the application. Please try again.",
          variant: "destructive",
        });
      });
  }, []);

  const handleChooseRecipe = () => {
    electronAPI.chooseRecipe()
      .then(recipe => {
        if (recipe) {
          toast({
            title: "Recipe Chosen",
            description: `${recipe.name}\nURL: ${recipe.url || 'N/A'}\nComment: ${recipe.comment || 'N/A'}`,
          });
          if (recipe.url) {
            window.open(recipe.url, '_blank');
          }
        } else {
          toast({
            title: "No Recipes",
            description: "No recipes available. Please add some recipes first.",
          });
        }
      })
      .catch(error => {
        console.error('Choose recipe error:', error);
        toast({
          title: "Error",
          description: "Failed to choose a recipe. Please try again.",
          variant: "destructive",
        });
      });
  };

  const handleAddRecipe = () => {
    electronAPI.addRecipe(newRecipe)
      .then(() => {
        setIsAddRecipeOpen(false);
        setNewRecipe({ name: '', url: '', comment: '' });
        toast({
          title: "Recipe Added",
          description: `Recipe '${newRecipe.name}' has been added successfully!`,
        });
      })
      .catch(error => {
        console.error('Add recipe error:', error);
        toast({
          title: "Error",
          description: "Failed to add the recipe. Please try again.",
          variant: "destructive",
        });
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