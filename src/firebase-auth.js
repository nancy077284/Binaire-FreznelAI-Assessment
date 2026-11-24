const AUTH_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts'; 
export class FirebaseAuth {
    constructor({ apiKey, projectId }) { 
    this.apiKey = apiKey; 
    this.projectId = projectId; 
    }
    get configured() { 
    return Boolean(this.apiKey && this.projectId); 
    } 
    async authenticate({ email, password, displayName, createAccount }) { 
    if (!this.configured) throw new Error('Firebase is not configured. Add FIREBASE_API_KEY and FIREBASE_PROJECT_ID to .env.'); 
    const action = createAccount ? 'signUp' : 'signInWithPassword'; 
    const response = await fetch(`${AUTH_ENDPOINT}:${action}?key=${encodeURIComponent(this.apiKey)}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({ email, password, returnSecureToken: true, ...(createAccount ? { displayName } : {}) }), 
        signal: AbortSignal.timeout(10000),  
    }); 
    const payload = await response.json(); 
    if (!response.ok) throw new Error(this.messageFor(payload.error?.message));  
    return { email: payload.email, displayName: payload.displayName || displayName || '', idToken: payload.idToken }; 
} 
messageFor(code = '') { 
    const messages = {  
        EMAIL_EXISTS: 'An account already exists for that email.', 
        INVALID_EMAIL: 'Enter a valid email address.',
        INVALID_PASSWORD: 'The password must contain at least 6 characters.',       
        WEAK_PASSWORD: 'Choose a stronger password (at least 6 characters).',   
        EMAIL_NOT_FOUND: 'No Firebase account was found for that email.', 
        INVALID_LOGIN_CREDENTIALS: 'The email or password is incorrect.', 
        USER_DISABLED: 'This Firebase account has been disabled.', 
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a moment and try again.', 
        API_KEY_INVALID: 'The Firebase API key is not valid.', 
    }; 
    return messages[code] || `Firebase authentication failed (${code || 'unknown error'}).`;  
}  
}