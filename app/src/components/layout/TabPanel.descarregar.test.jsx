import React, { lazy } from 'react';
import { render, cleanup, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import TabPanel from './TabPanel';
import AbaCarregavel from './AbaCarregavel';
import useStore from '../../stores/useStore';

const st = () => useStore.getState();
beforeEach(() => useStore.setState({ abaAtiva: 'aba-perfil' }));
afterEach(() => cleanup());

describe('TabPanel - descarregarAoSair', () => {
    it('padrao (false): aba inativa continua montada, escondida', () => {
        render(<TabPanel id="aba-x"><p>filho</p></TabPanel>);
        expect(screen.getByText('filho')).toBeTruthy();
        expect(document.getElementById('aba-x').style.display).toBe('none');
    });
    it('descarregarAoSair: inativa nao renderiza nada (nem o container)', () => {
        render(<TabPanel id="aba-x" descarregarAoSair><p>filho</p></TabPanel>);
        expect(screen.queryByText('filho')).toBeNull();
        expect(document.getElementById('aba-x')).toBeNull();
    });
    it('descarregarAoSair: ativa renderiza e visivel; ao sair some', () => {
        useStore.setState({ abaAtiva: 'aba-x' });
        render(<TabPanel id="aba-x" descarregarAoSair><p>filho</p></TabPanel>);
        expect(screen.getByText('filho')).toBeTruthy();
        expect(document.getElementById('aba-x').style.display).toBe('block');
        act(() => st().setAbaAtiva('aba-y'));
        expect(screen.queryByText('filho')).toBeNull();
    });
    it('ativa com padrao: display block', () => {
        useStore.setState({ abaAtiva: 'aba-x' });
        render(<TabPanel id="aba-x"><p>filho</p></TabPanel>);
        expect(document.getElementById('aba-x').style.display).toBe('block');
    });
});

describe('AbaCarregavel', () => {
    it.each(['aba-mapa', 'aba-comunicacao'])('%s fica montada escondida fora de uso', (id) => {
        render(<AbaCarregavel id={id}><p>conteudo {id}</p></AbaCarregavel>);
        expect(screen.getByText(`conteudo ${id}`)).toBeTruthy();
        expect(document.getElementById(id).style.display).toBe('none');
    });
    it.each(['aba-ataque', 'aba-log', 'aba-mestre'])('%s some ao sair e volta ao entrar', (id) => {
        render(<AbaCarregavel id={id}><p>conteudo</p></AbaCarregavel>);
        expect(screen.queryByText('conteudo')).toBeNull();
        act(() => st().setAbaAtiva(id));
        expect(screen.getByText('conteudo')).toBeTruthy();
        act(() => st().setAbaAtiva('aba-perfil'));
        expect(screen.queryByText('conteudo')).toBeNull();
    });
    it('Suspense: mostra "Abrindo..." enquanto o conteudo lazy carrega e depois o conteudo', async () => {
        useStore.setState({ abaAtiva: 'aba-ataque' });
        let resolver;
        const Lazy = lazy(() => new Promise(r => { resolver = () => r({ default: () => <p>carregado</p> }); }));
        render(<AbaCarregavel id="aba-ataque"><Lazy /></AbaCarregavel>);
        expect(screen.getByRole('status').textContent).toBe('Abrindo...');
        await act(async () => { resolver(); });
        expect(await screen.findByText('carregado')).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
    });
});
