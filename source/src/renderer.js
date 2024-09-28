// renderer.js
document.addEventListener('DOMContentLoaded', () => {
    const chooseRecipeButton = document.getElementById('chooseRecipe');
    const recipeDisplay = document.getElementById('recipeDisplay');
    const addRecipeForm = document.getElementById('addRecipeForm');
  
    window.electronAPI.initialize();
  
    chooseRecipeButton.addEventListener('click', async () => {
      try {
        const recipe = await window.electronAPI.chooseRecipe();
        console.log('Received recipe:', recipe); // Add this line for debugging
        if (recipe) {
          recipeDisplay.innerHTML = `
            <div class="bg-white shadow overflow-hidden sm:rounded-lg">
              <div class="px-4 py-5 sm:px-6">
                <h3 class="text-lg leading-6 font-medium text-gray-900">${recipe.name || 'No name'}</h3>
              </div>
              <div class="border-t border-gray-200">
                <dl>
                  <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt class="text-sm font-medium text-gray-500">URL</dt>
                    <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      ${recipe.url ? `<a href="${recipe.url}" target="_blank" class="text-blue-600 hover:text-blue-800">${recipe.url}</a>` : 'No URL'}
                    </dd>
                  </div>
                  <div class="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt class="text-sm font-medium text-gray-500">Comment</dt>
                    <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${recipe.comment || 'No comment'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          `;
        } else {
          recipeDisplay.innerHTML = '<p class="text-red-500">No recipes available.</p>';
        }
      } catch (error) {
        console.error('Error choosing recipe:', error);
        recipeDisplay.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
      }
    });
  
    addRecipeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('recipeName').value;
      const url = document.getElementById('recipeUrl').value;
      const comment = document.getElementById('recipeComment').value;
      
      try {
        await window.electronAPI.addRecipe({ name, url, comment });
        addRecipeForm.reset();
        alert('Recipe added successfully!');
      } catch (error) {
        console.error('Error adding recipe:', error);
        alert(`Error adding recipe: ${error.message}`);
      }
    });
  });