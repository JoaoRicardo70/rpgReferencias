import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ImportadorPrevia from './ImportadorPrevia';
import { prepararImportacao } from '../../core/importadorIA';

const itensBase = () => prepararImportacao([
    {
        nome: 'Fênix', categoria: 'forma',
        efeitosPassivos: [{ atributo: 'acerto', propriedade: 'base', valor: 80 }, { atributo: 'dano', propriedade: 'mgeral', valor: 40 }],
        naoAplicado: ['x50 em tudo'], efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 3 }],
    },
    { nome: 'Golpe', categoria: 'habilidade' },
    { descricao: 'sem nome' },
], 'habilidade', 1);

function montar(itens = itensBase()) {
    const props = {
        itens, onAtualizar: vi.fn(), onRemover: vi.fn(), onConfirmar: vi.fn(), onVoltar: vi.fn(), onAdicionarOutra: vi.fn(),
    };
    render(<ImportadorPrevia {...props} />);
    return props;
}

afterEach(() => cleanup());

describe('ImportadorPrevia', () => {
    it('renderiza um item por linha com nome e contador de marcados', () => {
        montar();
        expect(screen.getAllByLabelText('Nome')).toHaveLength(3);
        expect(screen.getByDisplayValue('Fênix')).toBeTruthy();
        expect(screen.getByDisplayValue('Golpe')).toBeTruthy();
        expect(screen.getByText(/2 de 3 marcados/)).toBeTruthy();
    });

    it('checkbox: marcado conforme o item; inválido fica desabilitado', () => {
        montar();
        expect(screen.getByLabelText('Importar Fênix').checked).toBe(true);
        const sem = screen.getByLabelText('Importar item sem nome');
        expect(sem.checked).toBe(false);
        expect(sem.disabled).toBe(true);
    });

    it('desmarcar chama onAtualizar com marcado false', () => {
        const p = montar();
        fireEvent.click(screen.getByLabelText('Importar Fênix'));
        expect(p.onAtualizar).toHaveBeenCalledTimes(1);
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(1);
        expect(novo.marcado).toBe(false);
    });

    it('renomear atualiza o nome e mantém marcado', () => {
        const p = montar();
        fireEvent.change(screen.getByDisplayValue('Golpe'), { target: { value: 'Golpe Novo' } });
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(2);
        expect(novo.objeto.nome).toBe('Golpe Novo');
        expect(novo.valido).toBe(true);
        expect(novo.marcado).toBe(true);
    });

    it('nome vazio (ou só espaços) torna inválido e desmarca', () => {
        const p = montar();
        fireEvent.change(screen.getByDisplayValue('Golpe'), { target: { value: '   ' } });
        const [, novo] = p.onAtualizar.mock.calls[0];
        expect(novo.valido).toBe(false);
        expect(novo.marcado).toBe(false);
    });

    it('dar nome a um item inválido o torna válido mas não o marca sozinho', () => {
        const p = montar();
        fireEvent.change(screen.getAllByLabelText('Nome')[2], { target: { value: 'Agora tem' } });
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(3);
        expect(novo.valido).toBe(true);
        expect(novo.marcado).toBe(false);
    });

    it('trocar categoria ajusta os campos (habilidade -> forma)', () => {
        const p = montar();
        const selects = screen.getAllByLabelText('Categoria');
        expect(selects[1].value).toBe('habilidade');
        fireEvent.change(selects[1], { target: { value: 'forma' } });
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(2);
        expect(novo.objeto.categoria).toBe('forma');
        expect(novo.objeto).not.toHaveProperty('maestriaRequerida');
        expect(novo.objeto.fadigaPorUso).toBe(0);
    });

    it('remover chama onRemover com a chave', () => {
        const p = montar();
        fireEvent.click(screen.getAllByLabelText('Tirar da lista')[1]);
        expect(p.onRemover).toHaveBeenCalledWith(2);
    });

    it('Gravar mostra a contagem e chama onConfirmar', () => {
        const p = montar();
        fireEvent.click(screen.getByText('Gravar 2 no Grimório'));
        expect(p.onConfirmar).toHaveBeenCalledTimes(1);
    });

    it('Gravar fica desabilitado com 0 marcados', () => {
        const itens = itensBase().map(i => ({ ...i, marcado: false }));
        montar(itens);
        const btn = screen.getByText('Gravar 0 no Grimório');
        expect(btn.disabled).toBe(true);
    });

    it('item marcado mas inválido não conta', () => {
        const itens = itensBase().map(i => ({ ...i, marcado: true }));
        montar(itens);
        expect(screen.getByText('Gravar 2 no Grimório')).toBeTruthy();
    });

    it('mostra efeitos ativos/passivos e o que não foi aplicado', () => {
        montar();
        expect(screen.getByText('ACERTO BASE 80')).toBeTruthy();
        expect(screen.getByText('FORCA BASE 3')).toBeTruthy();
        expect(screen.getByText('Passivos:')).toBeTruthy();
        expect(screen.getByText('Ativos:')).toBeTruthy();
        expect(screen.getByText(/x50 em tudo/)).toBeTruthy();
        expect(screen.getByText(/Multiplicador não importado/)).toBeTruthy();
        expect(screen.getAllByText(/Não aplicado automaticamente/).length).toBeGreaterThan(0);
        expect(screen.queryByText('DANO MGERAL 40')).toBeNull();
    });

    it('mostra avisos do normalizarPoder', () => {
        const itens = itensBase();
        itens[1] = { ...itens[1], avisos: ['atenção teste'] };
        montar(itens);
        expect(screen.getByText(/atenção teste/)).toBeTruthy();
    });

    it('botões Voltar e + Colar outra resposta', () => {
        const p = montar();
        fireEvent.click(screen.getByText('Voltar'));
        fireEvent.click(screen.getByText('+ Colar outra resposta'));
        expect(p.onVoltar).toHaveBeenCalledTimes(1);
        expect(p.onAdicionarOutra).toHaveBeenCalledTimes(1);
    });

    it('lista vazia renderiza sem quebrar, com Gravar desabilitado', () => {
        montar([]);
        expect(screen.getByText(/0 de 0 marcados/)).toBeTruthy();
        expect(screen.getByText('Gravar 0 no Grimório').disabled).toBe(true);
    });
});
