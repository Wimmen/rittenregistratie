const fs = require('fs');
const path = require('path');

async function syncFlows() {
    try {
        // 1. Read EXTERNAL_API_KEY from ../api/local.settings.json
        const settingsPath = path.join(__dirname, '../api/local.settings.json');

        if (!fs.existsSync(settingsPath)) {
            console.error(`Error: Could not find settings file at ${settingsPath}`);
            process.exit(1);
        }

        const settingsContent = fs.readFileSync(settingsPath, 'utf8');
        let settings;
        try {
            settings = JSON.parse(settingsContent);
        } catch (e) {
            console.error(`Error: Failed to parse settings file at ${settingsPath}`);
            process.exit(1);
        }

        const apiKey = settings?.Values?.ADMIN_API_KEY;
        if (!apiKey) {
            console.error("Error: ADMIN_API_KEY not found in local.settings.json");
            process.exit(1);
        }

        const apiUrl = `${settings.Values.XELFLOW_API_URL}/api/flows/${apiKey}`;

        // 2. Find all .json files in current directory
        const flowsDir = __dirname;
        let files = fs.readdirSync(flowsDir, { recursive: true }).filter(file => file.endsWith('.json'));

        const isChangedOnly = process.argv.includes('changed');
        if (isChangedOnly) {
            const { execSync } = require('child_process');
            try {
                const gitRoot = execSync('git rev-parse --show-toplevel', { cwd: flowsDir, encoding: 'utf8' }).trim();
                const gitStatusOutput = execSync('git status --porcelain .', { cwd: flowsDir, encoding: 'utf8' });
                
                const changedFiles = new Set();
                gitStatusOutput.split('\n').forEach(line => {
                    if (line.length > 3) {
                        let filePath = line.substring(3).trim();
                        if (filePath.includes(' -> ')) {
                            filePath = filePath.split(' -> ')[1].trim();
                        }
                        if (filePath.startsWith('"') && filePath.endsWith('"')) {
                            filePath = filePath.slice(1, -1);
                        }
                        const absolutePath = path.resolve(gitRoot, filePath).replace(/\\/g, '/');
                        changedFiles.add(absolutePath);
                    }
                });

                files = files.filter(file => {
                    const fileAbsolutePath = path.resolve(flowsDir, file).replace(/\\/g, '/');
                    return changedFiles.has(fileAbsolutePath);
                });
            } catch (error) {
                console.error("Error determining changed files from git:", error.message);
                process.exit(1);
            }
        }

        if (files.length === 0) {
            console.log(isChangedOnly ? "No changed .json flow files found to sync." : "No .json flow files found to sync.");
            return;
        }

        console.log(`Found ${files.length} flow(s) to sync...`);

        // 3. Sync each flow
        for (const file of files) {
            const filePath = path.join(flowsDir, file);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            let flowJson;

            try {
                flowJson = JSON.parse(fileContent);
            } catch (e) {
                console.error(`Skipping ${file}: Invalid JSON`);
                continue;
            }

            console.log(`Syncing ${file}...`);

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: fileContent
                });

                if (response.ok) {
                    console.log(`✓ Successfully synced ${file}`);
                } else {
                    const text = await response.text();
                    console.error(`✗ Failed to sync ${file}: ${response.status} ${response.statusText} - ${text}`);
                }
            } catch (error) {
                console.error(`✗ Network error syncing ${file}:`, error);
            }
        }

    } catch (error) {
        console.error("Unexpected error:", error);
        process.exit(1);
    }
}

syncFlows();
