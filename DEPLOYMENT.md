# Deployment Guide

This project is deployed to **Azure Static Web Apps** using **GitHub Actions**.

## Automatic Deployment

Deployment is triggered automatically whenever you push changes to the `main` branch.

**Workflow File**: `.github/workflows/azure-static-web-apps-wonderful-pond-069386c03.yml`

## Deployment Steps

To deploy a new version effectively, follow these steps:

1.  **Update Cache Version (Important for PWA/Updates)**
    *   Open `src/sw.js`.
    *   Find the `CACHE_NAME` variable at the top (e.g., `const CACHE_NAME = 'ritten-app-v1';`).
    *   Increment the version number (e.g., change `'ritten-app-v1'` to `'ritten-app-v2'`).
    *   *Why?* This forces the user's browser to discard the old cached files and download the new ones.

2.  **Update Project Version (Optional)**
    *   Open `package.json`.
    *   Increment the `version` field (e.g., `"1.0.0"` -> `"1.0.1"`).

3.  **Commit and Push**
    *   Commit your changes:
        ```bash
        git add .
        git commit -m "chore: bump version to v2 and deploy"
        ```
    *   Push to the `main` branch:
        ```bash
        git push origin main
        ```

4.  **Monitor Deployment**
    *   Go to the **Actions** tab in your GitHub repository.
    *   You will see a "Azure Static Web Apps CI/CD" workflow running.
    *   Wait for the "Build and Deploy Job" to complete (green checkmark).

## Troubleshooting

-   If changes are not visible, ensure you updated the `CACHE_NAME` in `sw.js`.
-   Check the GitHub Actions logs for any build errors.
