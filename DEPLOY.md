# Deploying Swing Analyzer to Surge

This guide explains how to deploy the Swing Analyzer application to Surge.

## How it Works

We've set up a GitHub Actions workflow that automatically:

1. Builds the application when you push to the main branch
2. Deploys the compiled files to Surge
3. Makes the application available at https://swing-analyzer.surge.sh

## Initial Setup

### Setting up Surge Token

1. Install surge globally: `npm install -g surge`
2. Login to surge: `surge login`
3. Get your token: `surge token`
4. Add the token to GitHub repository secrets:
   - Go to your repository on GitHub
   - Click on **Settings** > **Secrets and variables** > **Actions**
   - Click **New repository secret**
   - Name: `SURGE_TOKEN`
   - Value: Your surge token
   - Click **Add secret**

## Viewing Your Deployed Application

Your application is available at:

```
https://swing-analyzer.surge.sh
```

## Manual Deployment

### Using just (recommended)

```bash
just deploy
```

### Using npm directly

```bash
npm run build
npx surge ./dist swing-analyzer.surge.sh
```

### Using GitHub Actions

1. Go to the **Actions** tab in your repository
2. Select the **Deploy to Surge** workflow
3. Click **Run workflow**
4. Select the branch to deploy from (typically `main`)
5. Click **Run workflow**

## Troubleshooting

If your deployment isn't working:

1. Check the **Actions** tab to see if the workflow completed successfully
2. Verify that the `SURGE_TOKEN` secret is set correctly
3. Check if there are any build errors in the workflow logs
4. Make sure your surge domain isn't already taken

## Development vs Production

- Development: `npm run dev` runs a local development server
- Production: `npm run build` creates optimized files for deployment

The deployed version uses the production build, which is optimized for performance.
