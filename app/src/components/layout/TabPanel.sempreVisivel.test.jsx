import React from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import TabPanel from './TabPanel';
import AbaCarregavel from './AbaCarregavel';
import useStore from '../../stores/useStore';

beforeEach(() => useStore.setState({ abaAtiva: 'aba-perfil' }));
afterEach(() => cleanup());

describe('TabPanel - sempreVisivel', () => {
    it('inativa com sempreVisivel fica display block', () => {
        render(<TabPanel id="aba-x" sempreVisivel><p>filho</p></TabPanel>);
        expect(document.getElementById('aba-x').style.display).toBe('block');
        expect(screen.getByText('filho')).toBeTruthy();
    });
    it('sem sempreVisivel, inativa fica display none', () => {
        render(<TabPanel id="aba-x"><p>filho</p></TabPanel>);
        expect(document.getElementById('aba-x').style.display).toBe('none');
    });
    it('ativa fica block', () => {
        useStore.setState({ abaAtiva: 'aba-x' });
        render(<TabPanel id="aba-x"><p>filho</p></TabPanel>);
        expect(document.getElementById('aba-x').style.display).toBe('block');
    });
    it('descarregarAoSair vence sempreVisivel quando inativa (nao renderiza)', () => {
        render(<TabPanel id="aba-x" sempreVisivel descarregarAoSair><p>filho</p></TabPanel>);
        expect(document.getElementById('aba-x')).toBeNull();
    });
    it('className extra e aplicado junto com glass-panel', () => {
        render(<TabPanel id="aba-x" className="painel-gaveta"><p>filho</p></TabPanel>);
        const el = document.getElementById('aba-x');
        expect(el.classList.contains('glass-panel')).toBe(true);
        expect(el.classList.contains('painel-gaveta')).toBe(true);
    });
});

describe('AbaCarregavel - repasse de props', () => {
    it('repassa className e sempreVisivel (aba montavel inativa continua visivel)', () => {
        // aba-mapa fica sempre montada, entao o container existe mesmo inativa
        render(<AbaCarregavel id="aba-mapa" className="painel-gaveta" sempreVisivel><p>mapa</p></AbaCarregavel>);
        const el = document.getElementById('aba-mapa');
        expect(el.classList.contains('painel-gaveta')).toBe(true);
        expect(el.style.display).toBe('block');
    });
    it('sem sempreVisivel a aba sempre montada inativa fica escondida', () => {
        render(<AbaCarregavel id="aba-mapa"><p>mapa</p></AbaCarregavel>);
        expect(document.getElementById('aba-mapa').style.display).toBe('none');
    });
    it('aba comum inativa nao renderiza mesmo com sempreVisivel', () => {
        render(<AbaCarregavel id="aba-ataque" sempreVisivel><p>x</p></AbaCarregavel>);
        expect(document.getElementById('aba-ataque')).toBeNull();
    });
});
