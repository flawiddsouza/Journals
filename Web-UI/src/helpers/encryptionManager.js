import * as encryption from './encryption.js';
import fetchPlus from './fetchPlus.js';

// Stores decrypted content and keys in memory for active session
const sessionStore = new Map();

/**
 * Get the current encryption key from URL hash or session
 * @param {string} pageId
 * @returns {CryptoKey|null}
 */
function getCurrentKey(pageId) {
    return sessionStore.get(`key_${pageId}`) || null;
}

/**
 * Store encryption key for a page in session
 * @param {string} pageId
 * @param {CryptoKey} key
 */
function storeKey(pageId, key) {
    sessionStore.set(`key_${pageId}`, key);
}

/**
 * Store decrypted content temporarily
 * @param {string} pageId
 * @param {string} content
 */
function storeDecryptedContent(pageId, content) {
    sessionStore.set(`content_${pageId}`, content);
}

/**
 * Get stored decrypted content
 * @param {string} pageId
 * @returns {string|null}
 */
function getDecryptedContent(pageId) {
    return sessionStore.get(`content_${pageId}`) || null;
}

/**
 * Clear all stored data for a page
 * @param {string} pageId
 */
function clearPageData(pageId) {
    sessionStore.delete(`key_${pageId}`);
    sessionStore.delete(`content_${pageId}`);
}

/**
 * Protect a page with password-based encryption
 * @param {string} pageId
 * @param {string} content
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function protectPage(pageId, content, password) {
    try {
        if (!password || password.trim() === '') {
            return { success: false, error: 'Password cannot be empty' };
        }

        // Generate salt and derive key from password
        const salt = encryption.generateSalt();
        const key = await encryption.deriveKeyFromPassword(password, salt);

        // Encrypt the content
        const { encrypted, iv } = await encryption.encryptContent(key, content);

        // Pack encrypted data with salt and IV
        const packedData = encryption.packEncryptedData(encrypted, iv, salt);

        // Send to server
        const response = await fetchPlus.put(`/pages/password-protect/${pageId}`, {
            encryptedContent: packedData
        });

        if (response.success) {
            // Store key in session for immediate use
            storeKey(pageId, key);
            storeDecryptedContent(pageId, content);
            return { success: true };
        } else {
            return { success: false, error: response.error || 'Failed to protect page' };
        }
    } catch (error) {
        console.error('Encryption error:', error);
        return { success: false, error: 'Encryption failed' };
    }
}

/**
 * Unlock a page with password
 * @param {string} pageId
 * @param {string} password
 * @param {string} encryptedContent
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
export async function unlockPage(pageId, password, encryptedContent) {
    try {
        if (!password || password.trim() === '') {
            return { success: false, error: 'Password cannot be empty' };
        }

        // Unpack the encrypted data
        const { encrypted, iv, salt } = encryption.unpackEncryptedData(encryptedContent);

        // Derive key from password
        const key = await encryption.deriveKeyFromPassword(password, salt);

        // Try to decrypt
        const decryptedContent = await encryption.decryptContent(key, encrypted, iv);

        // Store key and content in session
        storeKey(pageId, key);
        storeDecryptedContent(pageId, decryptedContent);

        return { success: true, content: decryptedContent };
    } catch (error) {
        console.error('Decryption error:', error);
        return { success: false, error: 'Invalid password' };
    }
}

/**
 * Remove password protection from a page
 * @param {string} pageId
 * @param {string} password
 * @param {string} encryptedContent
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function removePasswordProtection(pageId, password, encryptedContent) {
    try {
        // First decrypt the content
        const unlockResult = await unlockPage(pageId, password, encryptedContent);

        if (!unlockResult.success) {
            return { success: false, error: unlockResult.error };
        }

        // Send decrypted content to server to replace encrypted version
        const response = await fetchPlus.post(`/pages/remove-password/${pageId}`, {
            decryptedContent: unlockResult.content
        });

        if (response.success) {
            clearPageData(pageId);
            return { success: true };
        } else {
            return { success: false, error: response.error || 'Failed to remove protection' };
        }
    } catch (error) {
        console.error('Remove protection error:', error);
        return { success: false, error: 'Failed to remove protection' };
    }
}

/**
 * Change page password
 * @param {string} pageId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} encryptedContent
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function changePagePassword(pageId, currentPassword, newPassword, encryptedContent) {
    try {
        // First decrypt with current password
        const unlockResult = await unlockPage(pageId, currentPassword, encryptedContent);

        if (!unlockResult.success) {
            return { success: false, error: 'Invalid current password' };
        }

        // Re-encrypt with new password
        const salt = encryption.generateSalt();
        const newKey = await encryption.deriveKeyFromPassword(newPassword, salt);
        const { encrypted, iv } = await encryption.encryptContent(newKey, unlockResult.content);
        const packedData = encryption.packEncryptedData(encrypted, iv, salt);

        // Send new encrypted content to server
        const response = await fetchPlus.put(`/pages/change-password/${pageId}`, {
            newEncryptedContent: packedData
        });

        if (response.success) {
            // Update session with new key
            storeKey(pageId, newKey);
            return { success: true };
        } else {
            return { success: false, error: response.error || 'Failed to change password' };
        }
    } catch (error) {
        console.error('Change password error:', error);
        return { success: false, error: 'Failed to change password' };
    }
}

/**
 * Save encrypted content (for ongoing edits to protected pages)
 * @param {string} pageId
 * @param {string} content
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveEncryptedContent(pageId, content) {
    try {
        const key = getCurrentKey(pageId);
        if (!key) {
            return { success: false, error: 'No encryption key available' };
        }

        // Get the current encrypted content to extract salt
        const response = await fetchPlus.get(`/pages/content/${pageId}`);
        const { salt } = encryption.unpackEncryptedData(response.content);

        // Encrypt with existing key and salt
        const { encrypted, iv } = await encryption.encryptContent(key, content);
        const packedData = encryption.packEncryptedData(encrypted, iv, salt);

        // Save to server
        const saveResponse = await fetchPlus.put(`/pages/${pageId}`, {
            pageContent: packedData
        });

        if (saveResponse.success) {
            storeDecryptedContent(pageId, content);
            return { success: true };
        } else {
            return { success: false, error: 'Failed to save' };
        }
    } catch (error) {
        console.error('Save encrypted content error:', error);
        return { success: false, error: 'Failed to save encrypted content' };
    }
}

/**
 * Check if page is protected and user has the key
 * @param {string} pageId
 * @returns {boolean}
 */
export function hasPageKey(pageId) {
    return getCurrentKey(pageId) !== null;
}

/**
 * Get content for a page (decrypted if available, encrypted if not)
 * @param {string} pageId
 * @returns {string|null}
 */
export function getPageContent(pageId) {
    const decrypted = getDecryptedContent(pageId);
    return decrypted;
}

/**
 * Clear all session data (on logout)
 */
export function clearAllSessionData() {
    sessionStore.clear();
}
