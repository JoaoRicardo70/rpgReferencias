import { describe, it, expect } from 'vitest';
import { montarIceServers, temTurnConfigurado } from '../core/iceServers';

describe('montarIceServers', () => {
    it('sem variáveis de ambiente devolve só STUN (nunca as credenciais openrelayproject revogadas)', () => {
        const servidores = montarIceServers({});
        expect(servidores.length).toBeGreaterThan(0);
        servidores.forEach(s => expect(String(s.urls)).toMatch(/^stun:/));
        expect(JSON.stringify(servidores)).not.toMatch(/openrelay/);
        expect(temTurnConfigurado({})).toBe(false);
    });

    it('acrescenta o TURN configurado com usuário e credencial', () => {
        const env = {
            VITE_TURN_URLS: 'turn:a.example:80, turn:a.example:443?transport=tcp',
            VITE_TURN_USERNAME: 'u',
            VITE_TURN_CREDENTIAL: 'p',
        };
        const turn = montarIceServers(env).at(-1);
        expect(turn).toEqual({ urls: ['turn:a.example:80', 'turn:a.example:443?transport=tcp'], username: 'u', credential: 'p' });
        expect(temTurnConfigurado(env)).toBe(true);
    });

    it('ignora TURN incompleto (sem usuário ou credencial)', () => {
        expect(temTurnConfigurado({ VITE_TURN_URLS: 'turn:a.example:80' })).toBe(false);
        expect(temTurnConfigurado({ VITE_TURN_URLS: 'turn:a.example:80', VITE_TURN_USERNAME: 'u' })).toBe(false);
        expect(temTurnConfigurado({ VITE_TURN_URLS: ' , ', VITE_TURN_USERNAME: 'u', VITE_TURN_CREDENTIAL: 'p' })).toBe(false);
    });
});
