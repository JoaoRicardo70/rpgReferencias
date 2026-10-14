import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';
import { CompendioFormProvider, useCompendioForm } from './CompendioFormContext';
import { CompendioClasseCard, CompendioGrandCard } from './CompendioSubComponents';
import { MECANICA_CLASSE, MECANICA_CLASSE_CANDIDATO, MECANICA_CLASSE_GRAND } from '../../core/classesMecanicas';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    uploadImagem: vi.fn(),
}));

let ctxAtual = null;
function Sonda() { ctxAtual = useCompendioForm(); return null; }
const classe = (id) => ctxAtual.todasClasses.find(c => c.id === id);

function montar(minhaFicha, { isMestre = false, personagens } = {}) {
    useStore.setState({ minhaFicha, isMestre, meuNome: 'Eu', personagens: personagens || { Eu: minhaFicha } });
}
function renderizar(ui) {
    return render(<CompendioFormProvider><Sonda />{ui}</CompendioFormProvider>);
}

beforeEach(() => { ctxAtual = null; });
afterEach(() => { cleanup(); });

describe('Compendio: efeitos de Classe vem do codigo', () => {
    it('override antigo de efeito em classes.ruler e ignorado; texto vem de MECANICA_CLASSE', () => {
        montar({ bio: {}, compendioOverrides: { classes: { ruler: { efeito: 'TEXTO ANTIGO DO OVERRIDE', desc: 'Lore nova' } } } });
        renderizar(null);
        const r = classe('ruler');
        expect(r.efeito).toBe(MECANICA_CLASSE.ruler);
        expect(r.efeito).not.toContain('ANTIGO');
        expect(r.efeitoCandidato).toBe(MECANICA_CLASSE_CANDIDATO.ruler);
        expect(r.efeitoGrand).toBe(MECANICA_CLASSE_GRAND.ruler);
        expect(r.mecanicaEmCodigo).toBe(true);
        expect(r.desc).toBe('Lore nova');
    });

    it('o card mostra Efeitos, Candidato a Grand e Grand', () => {
        montar({ bio: {} });
        renderizar(null);
        const { unmount } = render(<CompendioFormProvider><Sonda /></CompendioFormProvider>);
        unmount();
        cleanup();
        let c;
        function Pega() { const x = useCompendioForm(); c = x.todasClasses.find(k => k.id === 'avenger'); return <CompendioClasseCard classe={c} />; }
        render(<CompendioFormProvider><Pega /></CompendioFormProvider>);
        expect(screen.getByText(/Efeitos da Classe/)).toBeDefined();
        expect(screen.getByText(new RegExp('Poder Calculado x10\\. Foco de Ódio'))).toBeDefined();
        expect(screen.getByText(/Candidato a Grand:/)).toBeDefined();
        expect(screen.getByText(/👑 Grand:/)).toBeDefined();
        expect(document.body.textContent).toContain(MECANICA_CLASSE_CANDIDATO.avenger);
        expect(document.body.textContent).toContain(MECANICA_CLASSE_GRAND.avenger);
    });

    it('Alter Ego e Pretender nao repetem texto em Candidato/Grand', () => {
        montar({ bio: {} });
        renderizar(null);
        ['alterego', 'pretender'].forEach(id => {
            expect(classe(id).efeito).toBe(MECANICA_CLASSE[id]);
            expect(classe(id).efeitoCandidato).toBe('');
            expect(classe(id).efeitoGrand).toBe('');
        });
    });

    it('Classe sem mecanica em codigo (Shielder/Beast) mantem o efeito proprio e o override vale', () => {
        montar({ bio: {}, compendioOverrides: { classes: { beast: { efeito: 'Efeito do Mestre' } } } });
        renderizar(null);
        expect(classe('shielder').mecanicaEmCodigo).toBeUndefined();
        expect(classe('shielder').efeito).toContain('transferir');
        expect(classe('beast').efeito).toBe('Efeito do Mestre');
        expect(classe('beast').efeitoGrand).toBeUndefined();
    });

    it('Classe criada pelo Mestre (id novo) nao quebra', () => {
        montar({ bio: {}, compendioOverrides: { classes: { custom1: { id: 'custom1', nome: 'Custom', isExtra: true, efeito: 'X', cor: '#fff', icone: '?' } } } });
        renderizar(null);
        expect(classe('custom1').efeito).toBe('X');
    });

    it('habilidadeGrand do override aparece no card da Classe e e preservada', () => {
        montar({ bio: {}, compendioOverrides: { classes: { saber: { habilidadeGrand: 'Excalibur Suprema' } } } });
        let c;
        function Pega() { const x = useCompendioForm(); c = x.todasClasses.find(k => k.id === 'saber'); return <CompendioClasseCard classe={c} />; }
        render(<CompendioFormProvider><Pega /></CompendioFormProvider>);
        expect(c.habilidadeGrand).toBe('Excalibur Suprema');
        expect(screen.getByText(/Habilidade exclusiva do Grand:/)).toBeDefined();
        expect(screen.getByText(/Excalibur Suprema/)).toBeDefined();
    });

    it('sem habilidadeGrand, o card nao mostra o bloco de habilidade', () => {
        montar({ bio: {} });
        function Pega() { const x = useCompendioForm(); return <CompendioClasseCard classe={x.todasClasses.find(k => k.id === 'saber')} />; }
        render(<CompendioFormProvider><Pega /></CompendioFormProvider>);
        expect(screen.queryByText(/Habilidade exclusiva do Grand:/)).toBeNull();
    });
});

describe('Compendio: CompendioGrandCard', () => {
    it('mostra Beneficios do Grand, habilidade exclusiva e Beneficios do Candidato', () => {
        montar({ bio: {}, compendioOverrides: { classes: { ruler: { habilidadeGrand: 'Comando Absoluto' } }, grands: { ruler_presente: 'Ana' } } });
        function Pega() { const x = useCompendioForm(); return <CompendioGrandCard classe={x.todasClasses.find(k => k.id === 'ruler')} />; }
        render(<CompendioFormProvider><Pega /></CompendioFormProvider>);
        expect(screen.getByText(/Benefícios do Grand:/)).toBeDefined();
        expect(screen.getByText(/Habilidade exclusiva:/)).toBeDefined();
        expect(screen.getByText(/Comando Absoluto/)).toBeDefined();
        expect(screen.getByText(/Benefícios do Candidato:/)).toBeDefined();
        expect(screen.getByText('Ana')).toBeDefined();
        expect(document.body.textContent).toContain(MECANICA_CLASSE_GRAND.ruler);
    });

    it('Alter Ego (sem texto por nivel) nao mostra blocos de beneficios', () => {
        montar({ bio: {} });
        function Pega() { const x = useCompendioForm(); return <CompendioGrandCard classe={x.todasClasses.find(k => k.id === 'alterego')} />; }
        render(<CompendioFormProvider><Pega /></CompendioFormProvider>);
        expect(screen.queryByText(/Benefícios do Grand:/)).toBeNull();
        expect(screen.queryByText(/Benefícios do Candidato:/)).toBeNull();
        expect(screen.getByText('VAGO')).toBeDefined();
    });
});

describe('Compendio: edicao (Mestre) com habilidadeGrand', () => {
    it('Mestre edita Classe em codigo: ve o texto do sistema (sem textarea de efeitos) e salva habilidadeGrand', () => {
        const ficha = { bio: {}, compendioOverrides: {} };
        const updateFicha = vi.fn((cb) => cb(ficha));
        montar(ficha, { isMestre: true });
        useStore.setState({ updateFicha });
        function Pega() { const x = useCompendioForm(); return <CompendioClasseCard classe={x.todasClasses.find(k => k.id === 'ruler')} />; }
        const { container } = render(<CompendioFormProvider><Pega /></CompendioFormProvider>);
        const btn = Array.from(container.querySelectorAll('button')).find(b => /✏|Editar/i.test(b.textContent));
        expect(btn).toBeDefined();
        fireEvent.click(btn);
        expect(screen.getByText(/definidos pelo sistema/)).toBeDefined();
        const area = screen.getByPlaceholderText(/Habilidade que só o Grand/);
        fireEvent.change(area, { target: { value: 'Voz Divina' } });
        fireEvent.click(screen.getByText(/Guardar Regras/));
        expect(ficha.compendioOverrides.classes.ruler.habilidadeGrand).toBe('Voz Divina');
    });
});
