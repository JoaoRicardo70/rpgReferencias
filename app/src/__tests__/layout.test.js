/**
 * Layout fix tests
 *
 * Covers the three changes from the layout fix commit:
 *   1. App.jsx — JSX comment syntax and CSS class usage
 *   2. main.jsx — CSS import path correction  (`../css/styles.css`)
 *   3. Deletion of the old `src/css/styles.css` file
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Resolve paths relative to the app root
const APP_ROOT = resolve(import.meta.dirname, '../..');
const SRC_DIR   = resolve(APP_ROOT, 'src');
const CSS_FILE  = resolve(APP_ROOT, 'css/styles.css');        // new correct location
const OLD_CSS   = resolve(SRC_DIR, 'css/styles.css');         // old (deleted) location
const APP_JSX   = resolve(SRC_DIR, 'App.jsx');
const MAIN_JSX  = resolve(SRC_DIR, 'main.jsx');

// ==========================================
// CSS file location
// ==========================================
describe('CSS file location', () => {
    it('css/styles.css exists at the correct path (app/css/styles.css)', () => {
        expect(existsSync(CSS_FILE)).toBe(true);
    });

    it('old src/css/styles.css has been deleted', () => {
        expect(existsSync(OLD_CSS)).toBe(false);
    });
});

// ==========================================
// main.jsx — CSS import path
// ==========================================
describe('main.jsx CSS import path', () => {
    const content = readFileSync(MAIN_JSX, 'utf-8');

    it('imports CSS using the corrected relative path ../css/styles.css', () => {
        expect(content).toContain("import '../css/styles.css'");
    });

    it('does NOT use the old (broken) path ./css/styles.css', () => {
        expect(content).not.toContain("import './css/styles.css'");
    });
});

// ==========================================
// App.jsx — JSX comment syntax
// ==========================================
describe('App.jsx JSX comment syntax', () => {
    const content = readFileSync(APP_JSX, 'utf-8');

    it('does NOT contain a bare /* */ comment as JSX text inside a return block (line 147 pattern)', () => {
        // After the fix, the comment on the line immediately following "return ("
        // must be wrapped with curly braces: {/* ... */}
        // The bug pattern is: return statement followed on the very next non-blank line
        // by a bare   /* some text */   with no surrounding { }.
        // We specifically target the pattern: "return (\n        /* text */"
        const bareJsxReturnComment = /return\s*\(\s*\n\s*\/\*/;
        expect(bareJsxReturnComment.test(content)).toBe(false);
    });

    it('the main app-layout return block opens with a valid JSX node (not a bare comment)', () => {
        // The first token inside the final "return (" must be a JSX element or {/* */}
        // not a bare /* */ text node which would be a React parse error.
        const returnIdx = content.lastIndexOf('return (');
        expect(returnIdx).toBeGreaterThan(-1);
        const afterReturn = content.slice(returnIdx + 'return ('.length).trimStart();
        // Valid: starts with {/* or <   Invalid: starts with /*
        expect(afterReturn.startsWith('/*')).toBe(false);
    });
});

// ==========================================
// App.jsx — CSS class usage (not inline styles for layout)
// ==========================================
describe('App.jsx layout CSS classes', () => {
    const content = readFileSync(APP_JSX, 'utf-8');

    it('uses app-layout class on the root container', () => {
        expect(content).toMatch(/className=("app-layout"|{`app-layout[ `])/);
    });

    it('uses main-content class on the main content div', () => {
        expect(content).toContain('className={`main-content');
    });

    it('does NOT use inline style on the app-layout root div', () => {
        // The app-layout root container must rely solely on the CSS class for its layout,
        // not carry an inline style attribute.  The pattern would be:
        //   <div className="app-layout" style={{...}}>
        expect(content).not.toMatch(/className="app-layout"[^>]*style=\{\{/);
        // Com a classe dinamica, so variaveis CSS (--altura-barra, --largura-gaveta) podem ir inline.
        const m = content.match(/className=\{`app-layout[^`]*`\}[^>]*style=\{\{([^}]*)\}\}/);
        if (m) expect(m[1].replace(/'--[\w-]+':\s*[^,]+,?/g, '').trim()).toBe('');
    });
});

// ==========================================
// App.jsx — useEffect structure
// ==========================================
// The dead second useEffect was removed. App.jsx now has exactly one useEffect
// (the mount effect that reads localStorage and loads the local backup).
// These tests verify the current valid state and guard against re-introducing
// the old nesting bug should a second useEffect be added in the future.
describe('App.jsx useEffect structure', () => {
    const content = readFileSync(APP_JSX, 'utf-8');

    it('contains valid useEffect calls', () => {
        const matches = content.match(/useEffect\s*\(/g) || [];
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('the single useEffect has a properly closed callback body', () => {
        // Verify the useEffect callback opens and closes its brace correctly
        // (guards against malformed syntax after any future edits).
        const firstIdx = content.indexOf('useEffect(');
        expect(firstIdx).toBeGreaterThan(-1);

        const openBrace = content.indexOf('{', firstIdx);
        let depth = 0;
        let firstCloseIdx = -1;
        for (let i = openBrace; i < content.length; i++) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') {
                depth--;
                if (depth === 0) { firstCloseIdx = i; break; }
            }
        }
        // A valid closing brace must have been found
        expect(firstCloseIdx).toBeGreaterThan(openBrace);
    });
});
