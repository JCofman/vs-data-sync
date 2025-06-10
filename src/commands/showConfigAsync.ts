import fs from 'fs-extra';
import { commands, Selection, TextDocument, Uri, window, workspace } from 'vscode';
import { ConfigManager } from '../utils/configManager';
import { constants, extCommands } from '../utils/constants';
import { logger } from '../utils/logger';
import { showErrorMessageWithDetail } from '../utils/utils';

const escapeRegExp = (input: string) => {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getKeywordRegex = (keywords: string[]): RegExp => {
    const enhanceKeywords = keywords.map((keyword) => {
        let enhanceKeyword = escapeRegExp(keyword)
            .replace(`: `, `: ?`) // match space or no space
            .replace(`"`, `(?:'|")`); // match single quote or double quote
        return enhanceKeyword;
    });
    return new RegExp(enhanceKeywords.join('|'), 'gm');
};

const openConfigByPattern = async (settingFilePath: string, pattern: string): Promise<void> => {
    const sessionFileUri = Uri.file(settingFilePath);
    const document: TextDocument = await workspace.openTextDocument(sessionFileUri);
    const content = document.getText();

    // Navigate to the session configuration
    const regex = getKeywordRegex([pattern]);
    const matches = [...content.matchAll(regex)];
    let selections: Selection[] = [];
    matches.forEach((match) => {
        if (match.index) {
            const startPosition = document.positionAt(match.index);
            const endPosition = document.positionAt(match.index + match[0].length);
            selections.push(new Selection(startPosition, endPosition));
        }
    });
    await window.showTextDocument(document, { selection: selections?.[0] });
};

export const showConfigAsync = async (settingFilePath: string, pattern: string): Promise<void> => {
    try {
        // If config file is existed, show the text document on vscode
        const configFilePath = settingFilePath || ConfigManager.getInstance().getDefaultConfigFilePath();
        const isConfigFileExist = await fs.exists(configFilePath);
        if (isConfigFileExist) {
            openConfigByPattern(configFilePath, pattern);
            return;
        }

        // If config file is not exist, confirm to generate the config
        const quickPickItem = await window.showQuickPick(
            [constants.yes, constants.no].map((item) => ({ label: item })),
            {
                title: `Would you like to generate the configuration?`,
                placeHolder: `Choose "${constants.yes}" if you want to generate the configuration...`
            }
        );
        if (quickPickItem && quickPickItem.label === constants.yes) {
            await commands.executeCommand(extCommands.generateConfiguration);
        }
    } catch (error) {
        const message = `Failed to show configuration file!`;
        logger.error(message, error);
        showErrorMessageWithDetail(message, error);
    }
};
