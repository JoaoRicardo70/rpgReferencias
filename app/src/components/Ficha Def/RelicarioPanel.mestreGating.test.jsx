import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RelicarioPanel from './RelicarioPanel';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — RelicarioPanel.jsx > gating Mestre/Co-Mestre nos Capítulos 1-4 (Altar,
// Estigmas & Runas, Formas Base, Formas Verdadeiras) da Arma Espiritual/Fantasma
// Nobre, banner explicativo (AvisoArmaEspiritual) e o novo upload de imagem
// base64 via FileReader (substituindo o antigo uploadImagem/Firebase Storage).
//
// Diferente de RelicarioPanel.toggleEquiparById.test.jsx (que usa o Provider +
// componente-probe pra testar callbacks isolados), aqui renderizamos o
// <RelicarioPanel /> por inteiro — precisamos da UI real (botões, inputs,
// textareas, <select> de navegação) pra confirmar o que fica visível/desabilitado
// para jogador comum vs. Mestre/Co-Mestre.
//
// Não há @testing-library/jest-dom neste projeto (confirmado: não está no
// package.json nem em node_modules) — por isso usamos a propriedade nativa
// `.disabled` do DOM (`expect(input.disabled).toBe(true)`), exatamente como já
// é feito em MapaMundi.uploadCenario.test.jsx, em vez de `toBeDisabled()`.
//
// Navegação entre capítulos: o <select> de RelicarioNavegacao é sempre o
// PRIMEIRO <select> do DOM (RelicarioNavegacao é renderizado antes de
// ConteudoDinamico), mesmo nas páginas 5/6 que têm <select>s próprios
// (tipo/raridade por item) — por isso `container.querySelectorAll('select')[0]`.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: criarFichaCompleta(),
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

function criarFichaCompleta() {
    return {
        inventario: [
            { id: 100, nome: 'Espada Comum', tipo: 'arma', quantidade: 1, peso: 1, desc: '', raridade: 'comum', dano: '1d6', tipoDano: 'Cortante', equipado: false, efeitos: [] },
            { id: 200, nome: 'Poção de Cura', tipo: 'consumivel', quantidade: 2, peso: 0.5, desc: '', raridade: 'comum', equipado: false, efeitos: [] },
        ],
        notas: [{ id: 300, titulo: 'Pista', texto: 'Uma anotação qualquer.' }],
        armaEspiritual: {
            nome: 'EA - Exemplar', epiteto: 'Soberania de Teste', cantico: 'Cântico de teste', danoBase: '10d10',
            avatarHumano: '', avatarArma: '',
            passivas: [{ id: 1, texto: 'Passiva de teste' }],
            runas: [{ id: 2, texto: 'Runa de teste' }],
            formas: [{ id: 3, nome: 'Forma Um', dano: '2d4', img: '', configs: [{ id: 4, nome: 'Config Um', desc: 'Desc', img: '' }] }],
            formasVerdadeiras: [{ id: 5, nome: 'Verdadeira Um', dano: '20d10', img: '', configs: [{ id: 6, nome: 'Config V', desc: 'Desc V', img: '' }] }],
        },
    };
}

function irParaAba(container, abaId) {
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: abaId } });
}

function inputsDeTexto(container) {
    return Array.from(container.querySelectorAll('input:not([type="file"]), textarea'));
}

function arquivosDeUpload(container) {
    return Array.from(container.querySelectorAll('input[type="file"]'));
}

function criarArquivoFake(nome = 'foto.png') {
    return new File(['conteudo-fake'], nome, { type: 'image/png' });
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('RelicarioPanel — banner AvisoArmaEspiritual nos Capítulos 1-4', () => {
    const CAPITULOS_GATED = ['altar', 'passivas', 'formas', 'verdadeiras'];

    it.each(CAPITULOS_GATED)('capítulo "%s" com isMestre=false mostra o texto de escopo E a linha "somente o Mestre pode editar"', (aba) => {
        montarStore({ isMestre: false });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, aba);

        expect(container.textContent).toContain('Exclusivo da');
        expect(container.textContent).toContain('Arma Espiritual');
        expect(container.textContent).toContain('Somente o Mestre e Co-Mestres podem editar esta seção');
    });

    it.each(CAPITULOS_GATED)('capítulo "%s" com isMestre=true mostra o texto de escopo SEM a linha "somente o Mestre pode editar"', (aba) => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, aba);

        expect(container.textContent).toContain('Exclusivo da');
        expect(container.textContent).toContain('Arma Espiritual');
        expect(container.textContent).not.toContain('Somente o Mestre e Co-Mestres podem editar esta seção');
    });

    it('capítulos 5 (Arsenal) e 6 (Suprimentos) NUNCA mostram o banner da Arma Espiritual', () => {
        montarStore({ isMestre: false });
        const { container } = render(<RelicarioPanel />);

        irParaAba(container, 'arsenal');
        expect(container.textContent).not.toContain('Exclusivo da');

        irParaAba(container, 'suprimentos');
        expect(container.textContent).not.toContain('Exclusivo da');
    });
});

describe('RelicarioPanel — Capítulos 1-4 (Arma Espiritual) ficam bloqueados para quem NÃO é Mestre/Co-Mestre', () => {
    it('Capítulo 1 (Altar): isMestre=false desabilita todos os campos de texto e remove os dois inputs de upload de imagem', () => {
        montarStore({ isMestre: false });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'altar');

        const inputs = inputsDeTexto(container);
        expect(inputs.length).toBeGreaterThan(0);
        inputs.forEach(input => expect(input.disabled).toBe(true));

        expect(arquivosDeUpload(container).length).toBe(0);
        expect(screen.getAllByText('🔒 Somente o Mestre').length).toBe(2);
    });

    it('Capítulo 1 (Altar): isMestre=true habilita todos os campos de texto e mostra os dois inputs de upload de imagem', () => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'altar');

        const inputs = inputsDeTexto(container);
        expect(inputs.length).toBeGreaterThan(0);
        inputs.forEach(input => expect(input.disabled).toBe(false));

        expect(arquivosDeUpload(container).length).toBe(2);
        expect(screen.queryByText('🔒 Somente o Mestre')).toBeNull();
    });

    it('Capítulo 2 (Estigmas & Runas): isMestre=false esconde "+ Inscrever" e "✖" e desabilita os textareas', () => {
        montarStore({ isMestre: false });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'passivas');

        expect(screen.queryAllByText('+ Inscrever').length).toBe(0);
        expect(screen.queryAllByText('✖').length).toBe(0);
        inputsDeTexto(container).forEach(input => expect(input.disabled).toBe(true));
    });

    it('Capítulo 2 (Estigmas & Runas): isMestre=true mostra "+ Inscrever" (x2) e "✖" (x2) e habilita os textareas', () => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'passivas');

        expect(screen.getAllByText('+ Inscrever').length).toBe(2);
        expect(screen.getAllByText('✖').length).toBe(2);
        inputsDeTexto(container).forEach(input => expect(input.disabled).toBe(false));
    });

    it('Capítulo 3 (Formas Base): isMestre=false esconde os botões de criar/destruir/sub-configurar e desabilita campos + remove uploads', () => {
        montarStore({ isMestre: false });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'formas');

        expect(screen.queryByText('+ CRIAR FORMA BASE')).toBeNull();
        expect(screen.queryByText('+ Sub-Configuração')).toBeNull();
        expect(screen.queryAllByText('✖').length).toBe(0);
        inputsDeTexto(container).forEach(input => expect(input.disabled).toBe(true));
        expect(arquivosDeUpload(container).length).toBe(0);
    });

    it('Capítulo 3 (Formas Base): isMestre=true mostra os botões de criar/destruir/sub-configurar e habilita campos + uploads', () => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'formas');

        expect(screen.getByText('+ CRIAR FORMA BASE')).toBeDefined();
        expect(screen.getByText('+ Sub-Configuração')).toBeDefined();
        expect(screen.getAllByText('✖').length).toBe(2); // destruir forma + apagar sub-config
        inputsDeTexto(container).forEach(input => expect(input.disabled).toBe(false));
        expect(arquivosDeUpload(container).length).toBe(2); // img da forma + img da sub-config
    });

    it('Capítulo 4 (Formas Verdadeiras): isMestre=false esconde os botões de despertar/destruir/sub-configurar e desabilita campos + remove uploads', () => {
        montarStore({ isMestre: false });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'verdadeiras');

        expect(screen.queryByText('+ DESPERTAR FORMA VERDADEIRA')).toBeNull();
        expect(screen.queryByText('+ Sub-Configuração')).toBeNull();
        expect(screen.queryAllByText('✖').length).toBe(0);
        inputsDeTexto(container).forEach(input => expect(input.disabled).toBe(true));
        expect(arquivosDeUpload(container).length).toBe(0);
    });

    it('Capítulo 4 (Formas Verdadeiras): isMestre=true mostra os botões de despertar/destruir/sub-configurar e habilita campos + uploads', () => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'verdadeiras');

        expect(screen.getByText('+ DESPERTAR FORMA VERDADEIRA')).toBeDefined();
        expect(screen.getByText('+ Sub-Configuração')).toBeDefined();
        expect(screen.getAllByText('✖').length).toBe(2); // destruir forma verdadeira + apagar sub-config
        inputsDeTexto(container).forEach(input => expect(input.disabled).toBe(false));
        expect(arquivosDeUpload(container).length).toBe(2);
    });
});

describe('RelicarioPanel — Capítulos 5 e 6 (Arsenal Místico / Suprimentos & Notas) NUNCA são bloqueados, mesmo com isMestre=false', () => {
    it.each([true, false])('Capítulo 5 (Arsenal Místico) com isMestre=%s: campos habilitados e "+ Guardar Nova Arma"/"✖" presentes', (isMestre) => {
        montarStore({ isMestre });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'arsenal');

        expect(screen.getByText('+ Guardar Nova Arma')).toBeDefined();
        expect(screen.getAllByText('✖').length).toBeGreaterThan(0);
        const inputs = inputsDeTexto(container);
        expect(inputs.length).toBeGreaterThan(0);
        inputs.forEach(input => expect(input.disabled).toBe(false));
    });

    it.each([true, false])('Capítulo 6 (Suprimentos & Notas) com isMestre=%s: campos habilitados e "+ Novo Suprimento"/"+ Nova Folha"/"✖" presentes', (isMestre) => {
        montarStore({ isMestre });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'suprimentos');

        expect(screen.getByText('+ Novo Suprimento')).toBeDefined();
        expect(screen.getByText('+ Nova Folha')).toBeDefined();
        expect(screen.getAllByText('✖').length).toBeGreaterThan(0);
        const inputs = inputsDeTexto(container);
        expect(inputs.length).toBeGreaterThan(0);
        inputs.forEach(input => expect(input.disabled).toBe(false));
    });
});

describe('RelicarioPanel — ImageUploader: upload base64 via FileReader (substitui o antigo Firebase Storage)', () => {
    it('Happy Path: selecionar um arquivo no upload do Altar grava um data URL base64 na ficha (via updateFicha), sem chamar rede', async () => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'altar');

        const [inputAvatarHumano] = arquivosDeUpload(container);
        expect(inputAvatarHumano).toBeDefined();

        fireEvent.change(inputAvatarHumano, { target: { files: [criarArquivoFake()] } });

        await waitFor(() => {
            expect(mockState.minhaFicha.armaEspiritual.avatarHumano).toMatch(/^data:/);
        });

        expect(mockState.minhaFicha.armaEspiritual.avatarHumano).toMatch(/^data:image\/png;base64,/);

        // callSave() agora passa por callSaveDebounced() (RelicarioPanel.jsx), que atrasa
        // salvarFichaSilencioso() em 400ms (setTimeout com escudo global anti-spam) em vez de
        // chamar na hora — por isso esperamos com waitFor (timers reais, mesmo padrão de
        // espera assíncrona já usado nesta suíte para o FileReader) em vez de checar de imediato.
        await waitFor(() => {
            expect(salvarFichaSilencioso).toHaveBeenCalled();
        }, { timeout: 1000 });
    });

    it('Happy Path: upload de imagem numa Sub-Configuração de Forma Base também grava base64 no índice correto', async () => {
        montarStore({ isMestre: true });
        const { container } = render(<RelicarioPanel />);
        irParaAba(container, 'formas');

        // Ordem no DOM: primeiro o upload da própria Forma (forma.img), depois o da Sub-Configuração (cfg.img).
        const uploads = arquivosDeUpload(container);
        expect(uploads.length).toBe(2);
        const inputSubConfig = uploads[1];

        fireEvent.change(inputSubConfig, { target: { files: [criarArquivoFake('lamina.png')] } });

        await waitFor(() => {
            expect(mockState.minhaFicha.armaEspiritual.formas[0].configs[0].img).toMatch(/^data:/);
        });
        // O upload da forma em si (índice 0) não deve ter sido afetado.
        expect(mockState.minhaFicha.armaEspiritual.formas[0].img).toBe('');
    });
});
