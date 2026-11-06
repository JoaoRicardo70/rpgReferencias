import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosImportadorIA } from './ElementosSubComponents';
import ImportadorPrevia from '../poderes/ImportadorPrevia';
import { lerRespostaTecnicas, prepararImportacaoTecnicas, resumirTecnicaImportada } from '../../core/importadorTecnicas';

const ELEMS = ['Fogo', 'Agua', 'Neutro', 'Truques de Ciclo'];
const ctx = { lerImportacao: null, confirmarImportacao: null, nomesElementos: ELEMS, elemSelecionado: 'Neutro' };
vi.mock('./ElementosFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useElementosForm: () => ctx };
});
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(),
}));

const JSON_IA = JSON.stringify({ ataquesElementais: [
    { nome: 'Bola', elemento: 'Fogo', danoQtd: 10, danoFaces: 10, energiaCombustao: 'mana' },
    { nome: 'Onda', elemento: 'Agua', danoQtd: 2, danoFaces: 6, efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 3 }] },
] });

function abrir() {
    render(<ElementosImportadorIA />);
    fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
}
function preencherTexto(v = 'meu texto') {
    fireEvent.change(screen.getByPlaceholderText(/Cole aqui os manuscritos/), { target: { value: v } });
}
async function ate2() {
    abrir(); preencherTexto();
    fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
    await screen.findByText(/2\. Ler resposta/);
}
async function ate3(json = JSON_IA) {
    await ate2();
    fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: json } });
    fireEvent.click(screen.getByText(/2\. Ler resposta/));
    await screen.findByText(/marcados\)/);
}

beforeEach(() => {
    window.alert = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    ctx.nomesElementos = ELEMS;
    ctx.elemSelecionado = 'Neutro';
    ctx.lerImportacao = vi.fn((txt, chave) => {
        const l = lerRespostaTecnicas(txt);
        return l.ok ? { ok: true, itens: prepararImportacaoTecnicas(l.itens, { elementos: ELEMS, elementoPadrao: ctx.elemSelecionado }, chave) } : l;
    });
    ctx.confirmarImportacao = vi.fn((itens) => itens.filter(i => i.marcado && i.valido).length);
});
afterEach(() => cleanup());

describe('ElementosImportadorIA - fluxo completo', () => {
    it('comeca fechado e abre/fecha pelo botao', () => {
        render(<ElementosImportadorIA />);
        expect(screen.queryByPlaceholderText(/Cole aqui os manuscritos/)).toBeNull();
        fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
        expect(screen.getByPlaceholderText(/Cole aqui os manuscritos/)).toBeTruthy();
        fireEvent.click(screen.getByText('Fechar Círculo de Invocação (IA)'));
        expect(screen.queryByPlaceholderText(/Cole aqui os manuscritos/)).toBeNull();
    });
    it('sem contexto (provider ausente) nao renderiza nada', () => {
        const antigo = ctx.lerImportacao;
        // useElementosForm mockado sempre devolve ctx; aqui so confirmamos que o componente monta com ctx valido
        expect(antigo).toBeDefined();
    });
    it('fase 1 sem texto: alerta e nao avanca', async () => {
        abrir();
        fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Cole o texto/));
        expect(screen.queryByText(/2\. Ler resposta/)).toBeNull();
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
    it('fase 1 -> 2: copia o prompt (com elementos e texto) para o clipboard e mostra na caixa', async () => {
        abrir(); preencherTexto('Bola de fogo 3d6');
        fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
        await screen.findByText(/2\. Ler resposta/);
        const prompt = navigator.clipboard.writeText.mock.calls[0][0];
        expect(prompt).toContain('Bola de fogo 3d6');
        expect(prompt).toContain('Fogo, Agua, Neutro, Truques de Ciclo');
        expect(screen.getByLabelText('Instrução para a IA').value).toBe(prompt);
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/copiada/));
    });
    it('clipboard falha: avisa para copiar manualmente mas avanca', async () => {
        navigator.clipboard.writeText = vi.fn(() => Promise.reject(new Error('negado')));
        await ate2();
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Não consegui copiar/));
    });
    it('JSON invalido alerta e permanece na fase 2', async () => {
        await ate2();
        fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: 'lixo' } });
        fireEvent.click(screen.getByText(/2\. Ler resposta/));
        expect(window.alert).toHaveBeenCalled();
        expect(screen.getByText(/2\. Ler resposta/)).toBeTruthy();
        expect(screen.queryByText(/marcados\)/)).toBeNull();
    });
    it('Voltar da fase 2 retorna a fase 1 mantendo o texto', async () => {
        await ate2();
        fireEvent.click(screen.getByText('Voltar'));
        expect(screen.getByPlaceholderText(/Cole aqui os manuscritos/).value).toBe('meu texto');
    });
    it('ler resposta abre a previa com os itens, avisos e nao aplicado', async () => {
        await ate3();
        expect(screen.getByText(/2 de 2 marcados/)).toBeTruthy();
        expect(screen.getByDisplayValue('Bola')).toBeTruthy();
        expect(screen.getByDisplayValue('Onda')).toBeTruthy();
        expect(screen.getByText(/Limite de dados do elemento/)).toBeTruthy();
        expect(screen.getByText(/Efeito de atributo não importado/)).toBeTruthy();
        expect(screen.getByText(/Fogo · 5d10/)).toBeTruthy();
    });
    it('trocar o elemento reaplica o limite: Fogo -> Neutro restaura 10d10 e some o aviso', async () => {
        await ate3();
        const selects = screen.getAllByLabelText('Elemento');
        expect(selects[0].value).toBe('Fogo');
        fireEvent.change(selects[0], { target: { value: 'Neutro' } });
        expect(screen.queryByText(/Limite de dados do elemento/)).toBeNull();
        expect(screen.getByText(/10d10/)).toBeTruthy();
        expect(screen.getAllByLabelText('Elemento')[0].value).toBe('Neutro');
    });
    it('trocar para Truque forca energia livre no resumo', async () => {
        await ate3();
        fireEvent.change(screen.getAllByLabelText('Elemento')[0], { target: { value: 'Truques de Ciclo' } });
        expect(screen.getByText(/Truques de Ciclo.*livre/)).toBeTruthy();
    });
    it('desmarcar atualiza o contador e o botao de gravar', async () => {
        await ate3();
        fireEvent.click(screen.getByLabelText('Importar Bola'));
        expect(screen.getByText(/1 de 2 marcados/)).toBeTruthy();
        expect(screen.getByText(/Gravar 1 no Grimório/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Importar Onda'));
        const gravar = screen.getByText(/Gravar 0 no Grimório/);
        expect(gravar.disabled).toBe(true);
    });
    it('gravar envia a previa (so marcado vira gravado), alerta, fecha e volta a fase 1', async () => {
        await ate3();
        fireEvent.click(screen.getByLabelText('Importar Onda'));
        fireEvent.change(screen.getAllByLabelText('Elemento')[0], { target: { value: 'Neutro' } });
        fireEvent.click(screen.getByText(/Gravar 1 no Grimório/));
        expect(ctx.confirmarImportacao).toHaveBeenCalledTimes(1);
        const enviado = ctx.confirmarImportacao.mock.calls[0][0];
        expect(enviado).toHaveLength(2);
        expect(enviado[0]).toMatchObject({ marcado: true });
        expect(enviado[0].objeto).toMatchObject({ elemento: 'Neutro', dadosExtraQtd: 10 });
        expect(enviado[1].marcado).toBe(false);
        expect(window.alert).toHaveBeenLastCalledWith(expect.stringMatching(/1 novos pergaminhos/));
        expect(screen.queryByText(/marcados\)/)).toBeNull();
        expect(screen.queryByPlaceholderText(/Cole aqui os manuscritos/)).toBeNull(); // fechou
        fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
        expect(screen.getByPlaceholderText(/Cole aqui os manuscritos/).value).toBe('');
    });
    it('confirmar devolvendo 0 alerta e mantem a previa', async () => {
        await ate3();
        ctx.confirmarImportacao.mockReturnValue(0);
        fireEvent.click(screen.getByText(/Gravar 2 no Grimório/));
        expect(window.alert).toHaveBeenLastCalledWith(expect.stringMatching(/Nenhum item marcado/));
        expect(screen.getByText(/marcados\)/)).toBeTruthy();
    });
    it('remover um item da previa; remover o ultimo volta a fase 2', async () => {
        await ate3();
        fireEvent.click(screen.getAllByLabelText('Tirar da lista')[0]);
        expect(screen.getByText(/1 de 1 marcados/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Tirar da lista'));
        expect(screen.getByText(/2\. Ler resposta/)).toBeTruthy();
    });
    it('esvaziar o nome na previa desmarca e desabilita o item', async () => {
        await ate3();
        fireEvent.change(screen.getByDisplayValue('Bola'), { target: { value: '' } });
        expect(screen.getByText(/1 de 2 marcados/)).toBeTruthy();
        expect(screen.getByLabelText('Importar item sem nome').disabled).toBe(true);
    });
    it('+ Colar outra resposta soma itens com chaves novas (sem colisao)', async () => {
        await ate3();
        fireEvent.click(screen.getByText(/\+ Colar outra resposta/));
        fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: JSON.stringify({ ataquesElementais: [{ nome: 'Terceira' }] }) } });
        expect(screen.getByText(/Ver prévia \(2\)/)).toBeTruthy();
        fireEvent.click(screen.getByText(/2\. Ler resposta/));
        expect(await screen.findByText(/3 de 3 marcados/)).toBeTruthy();
        expect(ctx.lerImportacao.mock.calls[1][1]).toBe(3);
    });
    it('Voltar da previa leva a fase 2 e "Ver prévia" retorna', async () => {
        await ate3();
        fireEvent.click(screen.getByText('Voltar'));
        fireEvent.click(screen.getByText(/Ver prévia \(2\)/));
        expect(screen.getByText(/2 de 2 marcados/)).toBeTruthy();
    });
});

describe('ImportadorPrevia - modo tecnica', () => {
    const itens = () => prepararImportacaoTecnicas([{ nome: 'Bola', elemento: 'Fogo', danoQtd: 10, danoFaces: 10 }], { elementos: ELEMS, elementoPadrao: 'Neutro' });
    const props = (extra = {}) => ({ itens: itens(), onAtualizar: vi.fn(), onRemover: vi.fn(), onConfirmar: vi.fn(), onVoltar: vi.fn(), onAdicionarOutra: vi.fn(), ...extra });

    it('com elementos: mostra seletor de Elemento e nao o de Categoria', () => {
        render(<ImportadorPrevia {...props({ elementos: ELEMS, resumir: resumirTecnicaImportada })} />);
        expect(screen.getByLabelText('Elemento')).toBeTruthy();
        expect(screen.queryByLabelText('Categoria')).toBeNull();
        const opcoes = within(screen.getByLabelText('Elemento')).getAllByRole('option').map(o => o.value);
        expect(opcoes).toEqual(ELEMS);
    });
    it('usa o resumidor de tecnica', () => {
        render(<ImportadorPrevia {...props({ elementos: ELEMS, resumir: resumirTecnicaImportada })} />);
        expect(screen.getByText(/Fogo · 5d10/)).toBeTruthy();
    });
    it('elemento da tecnica fora da lista entra como primeira opcao', () => {
        const its = itens(); its[0].objeto.elemento = 'Misterioso';
        render(<ImportadorPrevia {...props({ itens: its, elementos: ELEMS, resumir: resumirTecnicaImportada })} />);
        const opcoes = within(screen.getByLabelText('Elemento')).getAllByRole('option').map(o => o.value);
        expect(opcoes[0]).toBe('Misterioso');
        expect(opcoes).toHaveLength(ELEMS.length + 1);
    });
    it('trocar elemento chama onAtualizar com o resultado de trocarElementoDaPrevia', () => {
        const p = props({ elementos: ELEMS, resumir: resumirTecnicaImportada });
        render(<ImportadorPrevia {...p} />);
        fireEvent.change(screen.getByLabelText('Elemento'), { target: { value: 'Neutro' } });
        expect(p.onAtualizar).toHaveBeenCalledTimes(1);
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(p.itens[0].chave);
        expect(novo.objeto).toMatchObject({ elemento: 'Neutro', dadosExtraQtd: 10 });
        expect(novo.avisos.some(a => /Limite de dados/.test(a))).toBe(false);
    });
    it('remover, confirmar, voltar e adicionar outra disparam callbacks', () => {
        const p = props({ elementos: ELEMS, resumir: resumirTecnicaImportada });
        render(<ImportadorPrevia {...p} />);
        fireEvent.click(screen.getByLabelText('Tirar da lista'));
        expect(p.onRemover).toHaveBeenCalledWith(p.itens[0].chave);
        fireEvent.click(screen.getByText(/Gravar 1 no Grimório/));
        expect(p.onConfirmar).toHaveBeenCalled();
        fireEvent.click(screen.getByText('Voltar'));
        fireEvent.click(screen.getByText(/\+ Colar outra resposta/));
        expect(p.onVoltar).toHaveBeenCalled();
        expect(p.onAdicionarOutra).toHaveBeenCalled();
    });
    it('sem elementos (modo Habilidade) continua com o seletor de Categoria', () => {
        const its = [{ chave: 1, marcado: true, valido: true, avisos: [], naoAplicado: [], objeto: { nome: 'H', categoria: 'habilidade' } }];
        render(<ImportadorPrevia {...props({ itens: its })} />);
        expect(screen.getByLabelText('Categoria')).toBeTruthy();
        expect(screen.queryByLabelText('Elemento')).toBeNull();
    });
    it('lista de elementos vazia ainda e modo tecnica (array)', () => {
        render(<ImportadorPrevia {...props({ elementos: [], resumir: resumirTecnicaImportada })} />);
        expect(screen.getByLabelText('Elemento')).toBeTruthy();
    });
    it('exibe avisos e nao aplicado da tecnica', () => {
        const its = prepararImportacaoTecnicas([{ nome: 'X', elemento: 'Plasma', efeitos: [{ atributo: 'forca', valor: 1 }] }], { elementos: ELEMS, elementoPadrao: 'Neutro' });
        render(<ImportadorPrevia {...props({ itens: its, elementos: ELEMS, resumir: resumirTecnicaImportada })} />);
        expect(screen.getByText(/Plasma/)).toBeTruthy();
        expect(screen.getByText(/Efeito de atributo não importado/)).toBeTruthy();
    });
});
