# Deploying Swing Analyzer to GitHub Pages

This guide explains how to deploy the Swing Analyzer application to GitHub Pages using the automated GitHub Actions workflow.

## How it Works

We've set up a GitHub Actions workflow that automatically:

1. Builds the application when you push to the main branch
2. Deploys the compiled files to the `gh-pages` branch
3. Makes the application available online through GitHub Pages

## Initial Setup

After setting up the GitHub Actions workflow, you need to configure GitHub Pages in your repository:

1. Go to your repository on GitHub
2. Click on **Settings**
3. Navigate to **Pages** in the left sidebar
4. Under **Build and deployment**:
   - Source: Select **GitHub Actions**
5. Click **Save**

### Repository Permissions

Ensure your workflow has proper permissions to deploy:

1. In your repository, go to **Settings** > **Actions** > **General**
2. Under **Workflow permissions**, select **Read and write permissions**
3. Click **Save**

![Workflow Permissions](https://docs.github.com/assets/cb-40251/images/help/actions/workflow-settings-actions-permissions.png)

### Repository Structure

The GitHub Actions workflow is set up for the following repository structure:

```
video-edit/                 # Root repository
├── .github/                # GitHub configuration
│   └── workflows/          # GitHub Actions workflows
│       └── deploy.yml      # Deployment workflow
└── swing-analyzer/         # Swing analyzer application
    ├── dist/               # Production build (generated)
    ├── public/             # Public assets
    ├── src/                # Source code
    ├── package.json        # Dependencies
    └── ...
```

## Viewing Your Deployed Application

Once configured, your application will be available at:

```
https://<username>.github.io/<repository-name>/
```

For example:

```
https://idvorkin.github.io/video-edit/
```

## Manual Deployment

If you need to manually trigger a deployment:

1. Go to the **Actions** tab in your repository
2. Select the **Deploy to GitHub Pages** workflow
3. Click **Run workflow**
4. Select the branch to deploy from (typically `main`)
5. Click **Run workflow**

## Troubleshooting

If your deployment isn't working:

1. Check the **Actions** tab to see if the workflow completed successfully
2. Verify that the `gh-pages` branch has been created and contains the built files
3. Make sure GitHub Pages is configured to use the `gh-pages` branch
4. Check if there are any permissions issues in the workflow logs

## Development vs Production

- Development: `npm start` runs a local development server
- Production: `npm run build` creates optimized files for deployment

The deployed version will use the production build, which is optimized for performance.
