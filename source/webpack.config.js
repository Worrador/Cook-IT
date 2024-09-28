const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/, // Match both .js and .jsx files
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'], // Added postcss-loader for Tailwind
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx'], // Allow importing .js and .jsx files without specifying the extension
    alias: {
      '@': path.resolve(__dirname, 'src'), // This allows using @/ in import statements
    },
  },
};