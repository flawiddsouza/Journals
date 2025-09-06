// Client-side encryption utilities based on Excalidraw's approach
// Uses Web Crypto API for AES-GCM encryption

/**
 * Generate a random encryption key
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // extractable
        ["encrypt", "decrypt"]
    );
}

/**
 * Derive a key from a password using PBKDF2
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKeyFromPassword(password, salt) {
    const encoder = new TextEncoder();

    // Import password as key material
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    // Derive actual key
    return await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Generate a random salt
 * @returns {Uint8Array}
 */
export function generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Encrypt content with AES-GCM
 * @param {CryptoKey} key
 * @param {string} content
 * @returns {Promise<{encrypted: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encryptContent(key, content) {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(content)
    );

    return { encrypted, iv };
}

/**
 * Decrypt content with AES-GCM
 * @param {CryptoKey} key
 * @param {ArrayBuffer} encryptedData
 * @param {Uint8Array} iv
 * @returns {Promise<string>}
 */
export async function decryptContent(key, encryptedData, iv) {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}

/**
 * Export key to JWK format for storage/sharing
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function exportKey(key) {
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    return exported.k; // Return just the key material
}

/**
 * Import key from JWK format
 * @param {string} keyData
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(keyData) {
    return await window.crypto.subtle.importKey(
        "jwk",
        {
            k: keyData,
            alg: "A256GCM",
            ext: true,
            key_ops: ["encrypt", "decrypt"],
            kty: "oct",
        },
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Combine encrypted data, IV, and salt into a single base64 string
 * @param {ArrayBuffer} encrypted
 * @param {Uint8Array} iv
 * @param {Uint8Array} salt
 * @returns {string}
 */
export function packEncryptedData(encrypted, iv, salt) {
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return arrayBufferToBase64(combined);
}

/**
 * Extract encrypted data, IV, and salt from base64 string
 * @param {string} packedData
 * @returns {{encrypted: ArrayBuffer, iv: Uint8Array, salt: Uint8Array}}
 */
export function unpackEncryptedData(packedData) {
    const combined = base64ToArrayBuffer(packedData);
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    return { encrypted, iv, salt };
}

/**
 * Convert ArrayBuffer to base64 string
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
