import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ImportadorPrevia from './ImportadorPrevia';
import { prepararImportacao, contarPendentes, decidirTodosOsIncertos, definirTipoMultiplicador } from '../../core/importadorIA';

const itens = (bruto = {}) => prepararImportacao([{ nome: 'Rinnegan', categoria: 'poder', multiplicadores: [{ nome: 'Dano x800', atributo: 'dano', valor: 800 }], ...bruto }], 'poder', 1);
const propsBase = () => ({ onAtualizar: vi.fn(), onRemover: vi.fn(), onConfirmar: vi.fn(), onVoltar: vi.fn(), onAdicionarOutra: vi.fn() });
function montar(its) {
    const props = { itens: its, ...propsBase() };
    const r = render(<ImportadorPrevia {...props} />);
    return { ...props, container: r.container };
}
const gravar = () => screen.getByRole('button', { name: /Gravar/ });
const botao = (texto) => screen.getByText(texto, { selector: 'button' });
afterEach(() => cleanup());

describe('ImportadorPrevia - multiplicadores', () => {
    it('mostra chip xN em PODER DIRETO e os 5 botoes de Tipo, nenhum marcado', () => {
        montar(itens());
        expect(screen.getByText(/x800 em PODER DIRETO/)).toBeTruthy();
        const grupo = screen.getByRole('group', { name: 'Tipo de multiplicador' });
        ['Base', 'Geral', 'Forma', 'Absoluto', 'Único'].forEach(r => {
            const b = botao(r);
            expect(b.getAttribute('aria-pressed')).toBe('false');
            expect(grupo.contains(b)).toBe(true);
        });
    });

    it('efeito comum nao mostra botoes de Tipo', () => {
        montar(itens({ multiplicadores: undefined, efeitosIncertos: [{ atributo: 'acerto', propriedade: 'base', valor: 5 }] }));
        expect(screen.queryByRole('group', { name: 'Tipo de multiplicador' })).toBeNull();
    });

    it('clicar em um tipo chama onAtualizar com o tipo gravado', () => {
        const p = montar(itens());
        fireEvent.click(botao('Geral'));
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(1);
        expect(novo.objeto.efeitosIncertos[0].propriedade).toBe('mgeral');
    });

    it('cada botao de tipo grava o seu id', () => {
        const ids = { Base: 'mbase', Geral: 'mgeral', Forma: 'mformas', Absoluto: 'mabs', 'Único': 'munico' };
        Object.entries(ids).forEach(([rotulo, id]) => {
            const p = montar(itens());
            fireEvent.click(botao(rotulo));
            expect(p.onAtualizar.mock.calls[0][1].objeto.efeitosIncertos[0].propriedade).toBe(id);
            cleanup();
        });
    });

    it('tipo escolhido mostra "✔ " e aria-pressed true; os outros ficam false', () => {
        const its = itens();
        its[0].objeto = definirTipoMultiplicador(its[0].objeto, 'pai', 0, 'mabs');
        montar(its);
        expect(botao('✔ Absoluto').getAttribute('aria-pressed')).toBe('true');
        expect(botao('Base').getAttribute('aria-pressed')).toBe('false');
    });

    it('tipo sugerido pela IA ja vem marcado', () => {
        montar(itens({ multiplicadores: [{ atributo: 'dano', valor: 10, tipo: 'geral' }] }));
        expect(botao('✔ Geral').getAttribute('aria-pressed')).toBe('true');
    });

    it('Gravar fica desabilitado ate responder ativacao E tipo', () => {
        const its = itens();
        const props = propsBase();
        const { rerender } = render(<ImportadorPrevia itens={its} {...props} />);
        expect(gravar().disabled).toBe(true);
        const soAtivacao = [{ ...its[0], objeto: decidirTodosOsIncertos(its[0].objeto, 'ativo') }];
        expect(contarPendentes(soAtivacao[0].objeto)).toBe(1);
        rerender(<ImportadorPrevia itens={soAtivacao} {...props} />);
        expect(gravar().disabled).toBe(true);
        const completo = [{ ...soAtivacao[0], objeto: definirTipoMultiplicador(soAtivacao[0].objeto, 'pai', 0, 'mgeral') }];
        rerender(<ImportadorPrevia itens={completo} {...props} />);
        expect(gravar().disabled).toBe(false);
    });

    it('so o tipo respondido, sem ativacao, mantem Gravar desabilitado', () => {
        const its = itens();
        its[0].objeto = definirTipoMultiplicador(its[0].objeto, 'pai', 0, 'mbase');
        montar(its);
        expect(gravar().disabled).toBe(true);
    });

    it('marcador muda de ❓ para ✔ e a linha ganha classe respondido', () => {
        const its = itens();
        const a = montar(its);
        expect(a.container.querySelector('.importacao-incerto-estado').textContent).toBe('❓');
        expect(a.container.querySelector('.importacao-incerto').classList.contains('respondido')).toBe(false);
        cleanup();
        const ok = definirTipoMultiplicador(decidirTodosOsIncertos(its[0].objeto, 'passivo'), 'pai', 0, 'mgeral');
        const b = montar([{ ...its[0], objeto: ok }]);
        expect(b.container.querySelector('.importacao-incerto-estado').textContent).toBe('✔');
        expect(b.container.querySelector('.importacao-incerto').classList.contains('respondido')).toBe(true);
    });

    it('botao de ativacao escolhido mostra "✔ ⚡ Só ao ativar" com aria-pressed', () => {
        const its = itens();
        its[0].objeto = decidirTodosOsIncertos(its[0].objeto, 'ativo');
        montar(its);
        expect(screen.getByText('✔ ⚡ Só ao ativar').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('🛡️ Sempre (passivo)').getAttribute('aria-pressed')).toBe('false');
    });

    it('multiplicador na sub-habilidade mostra o nome da forma e grava o tipo na sub', () => {
        const p = montar(itens({ multiplicadores: undefined, subHabilidades: [{ nome: 'Limbo', multiplicadores: [{ atributo: 'dano', valor: 5 }] }] }));
        expect(screen.getByText(/Limbo: .*x5 em PODER DIRETO/)).toBeTruthy();
        fireEvent.click(botao('Único'));
        expect(p.onAtualizar.mock.calls[0][1].objeto.formas[0].configs[0].efeitosIncertos[0].propriedade).toBe('munico');
    });
});
