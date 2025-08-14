import SQLite from 'react-native-sqlite-storage';

const DATABASE_NAME = 'cookit.db';

// Initialize database
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    SQLite.openDatabase(
      {
        name: DATABASE_NAME,
        location: 'default',
      },
      (db) => {
        // Create recipes table
        db.executeSql(
          `CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            url TEXT,
            comment TEXT,
            last_shown DATETIME
          );`,
          [],
          () => {
            console.log('Database initialized successfully');
            resolve(db);
          },
          (error) => {
            console.error('Error creating table:', error);
            reject(error);
          }
        );
      },
      (error) => {
        console.error('Error opening database:', error);
        reject(error);
      }
    );
  });
};

// Add a new recipe
const addRecipe = (db, name, url, comment) => {
  return new Promise((resolve, reject) => {
    db.executeSql(
      'INSERT INTO recipes (name, url, comment) VALUES (?, ?, ?)',
      [name, url, comment],
      (_, result) => {
        resolve(result);
      },
      (error) => {
        reject(error);
      }
    );
  });
};

// Get all recipes
const getAllRecipes = (db) => {
  return new Promise((resolve, reject) => {
    db.executeSql(
      'SELECT * FROM recipes ORDER BY name',
      [],
      (_, result) => {
        const recipes = [];
        for (let i = 0; i < result.rows.length; i++) {
          recipes.push(result.rows.item(i));
        }
        resolve(recipes);
      },
      (error) => {
        reject(error);
      }
    );
  });
};

// Update recipe
const updateRecipe = (db, id, name, url, comment) => {
  return new Promise((resolve, reject) => {
    db.executeSql(
      'UPDATE recipes SET name = ?, url = ?, comment = ? WHERE id = ?',
      [name, url, comment, id],
      (_, result) => {
        resolve(result);
      },
      (error) => {
        reject(error);
      }
    );
  });
};

// Delete recipe
const deleteRecipe = (db, id) => {
  return new Promise((resolve, reject) => {
    db.executeSql(
      'DELETE FROM recipes WHERE id = ?',
      [id],
      (_, result) => {
        resolve(result);
      },
      (error) => {
        reject(error);
      }
    );
  });
};

// Update last shown timestamp
const updateLastShown = (db, id) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.executeSql(
      'UPDATE recipes SET last_shown = ? WHERE id = ?',
      [now, id],
      (_, result) => {
        resolve(result);
      },
      (error) => {
        reject(error);
      }
    );
  });
};

export {
  initDatabase,
  addRecipe,
  getAllRecipes,
  updateRecipe,
  deleteRecipe,
  updateLastShown,
};