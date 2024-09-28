import React, { useState, useEffect } from 'react';

const CookITApp = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentRecipe, setCurrentRecipe] = useState(null);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });

  useEffect(() => {
    window.electronAPI.initialize().then(() => setIsLoading(false));
  }, []);

  const handleChooseRecipe = async () => {
    try {
      const recipe = await window.electronAPI.chooseRecipe();
      setCurrentRecipe(recipe);
    } catch (error) {
      console.error('Error choosing recipe:', error);
      alert('Error choosing recipe: ' + error.message);
    }
  };

  const handleAddRecipe = async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.addRecipe(newRecipe);
      setNewRecipe({ name: '', url: '', comment: '' });
      alert('Recipe added successfully!');
    } catch (error) {
      console.error('Error adding recipe:', error);
      alert('Error adding recipe: ' + error.message);
    }
  };

  if (isLoading) {
    return <div>Loading Cook-IT...</div>;
  }

  return (
    <div>
      <h1>Cook-IT</h1>
      <button onClick={handleChooseRecipe}>Choose Random Recipe</button>
      {currentRecipe && (
        <div>
          <h2>{currentRecipe.name}</h2>
          <p>URL: <a href={currentRecipe.url} target="_blank" rel="noopener noreferrer">{currentRecipe.url}</a></p>
          <p>Comment: {currentRecipe.comment}</p>
        </div>
      )}
      <h2>Add New Recipe</h2>
      <form onSubmit={handleAddRecipe}>
        <input
          type="text"
          placeholder="Recipe Name"
          value={newRecipe.name}
          onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="URL"
          value={newRecipe.url}
          onChange={(e) => setNewRecipe({ ...newRecipe, url: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="Comment"
          value={newRecipe.comment}
          onChange={(e) => setNewRecipe({ ...newRecipe, comment: e.target.value })}
        />
        <button type="submit">Add Recipe</button>
      </form>
    </div>
  );
};

export default CookITApp;