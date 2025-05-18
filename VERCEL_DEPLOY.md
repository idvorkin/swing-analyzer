# Deploying Swing Analyzer to Vercel

This guide provides step-by-step instructions for deploying your Swing Analyzer application to Vercel for free hosting.

## Prerequisites

1. A [GitHub](https://github.com) account
2. A [Vercel](https://vercel.com) account (you can sign up with your GitHub account)
3. Your Swing Analyzer project pushed to a GitHub repository

## Deployment Steps

### 1. Push Your Code to GitHub

If you haven't already, push your code to GitHub:

```bash
# Initialize git repository if not already done
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit"

# Add your GitHub repository as remote
git remote add origin https://github.com/your-username/swing-analyzer.git

# Push to GitHub
git push -u origin main
```

### 2. Deploy to Vercel

#### Option A: Deploy from the Vercel Dashboard

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will automatically detect your project settings
5. Click "Deploy"

#### Option B: Deploy using Vercel CLI

1. Install the Vercel CLI:

   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:

   ```bash
   vercel login
   ```

3. Deploy from your project directory:

   ```bash
   vercel
   ```

4. Follow the prompts to complete the deployment

## Configuration Details

Your project has been configured for Vercel with the following files:

1. `vercel.json` - Contains the build and route configuration
2. Updated `package.json` - Includes the Vercel build command

The current configuration:

- Uses Parcel to build the application
- Outputs to the `dist` directory
- Sets up proper routing for the Single Page Application

## Troubleshooting

If you encounter any issues during deployment:

1. Check your Vercel build logs for errors
2. Ensure all dependencies are correctly listed in `package.json`
3. Verify your `vercel.json` configuration is correct
4. Make sure your project builds locally with `npm run build`

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Parcel Bundler Documentation](https://parceljs.org/docs/)
- [TensorFlow.js Deployment Best Practices](https://www.tensorflow.org/js/guide/deployment)

## Post-Deployment

After deployment:

1. Vercel will provide you with a URL for your deployed application
2. You can configure a custom domain in your Vercel project settings
3. Your application will automatically redeploy when you push changes to your GitHub repository
