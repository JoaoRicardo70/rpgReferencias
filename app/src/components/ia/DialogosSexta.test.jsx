import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, renderHook } from '@testing-library/react';
import { DialogosSextaProvider, ModalSexta, useDialogosSexta } from './DialogosSexta';

let api;
function Captura() { api = useDialogosSexta(); return null; }
const montar = (filhos = null) => render(<DialogosSextaProvider><Captura />{filhos}</DialogosSextaProvider>);

// Abre um dialogo e devolve a Promise ainda pendente.
function abrir(fn) {
    let p;
    act(() => { p = fn(); });
    return p;
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('DialogosSexta - confirmar', () => {
    it('botao de confirmar resolve true (rotulo customizado)', async () => {
        montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'Certeza?', textoConfirmar: 'Sim!' }));
        expect(screen.getByText('Certeza?')).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByText('Sim!')); });
        await expect(p).resolves.toBe(true);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('rotulo padrao "Confirmar" e classe de perigo', async () => {
        montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'x', perigo: true }));
        const btn = screen.getByText('Confirmar');
        expect(btn.className).toContain('btn-red');
        await act(async () => { fireEvent.click(btn); });
        await expect(p).resolves.toBe(true);
    });
    it('botao Cancelar resolve false', async () => {
        montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'x' }));
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await expect(p).resolves.toBe(false);
    });
    it('Esc resolve false', async () => {
        montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'x' }));
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        await expect(p).resolves.toBe(false);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('clique no fundo (backdrop) resolve false; clique dentro da caixa nao fecha', async () => {
        const { container } = montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'x' }));
        fireEvent.mouseDown(screen.getByRole('dialog'));
        expect(screen.queryByRole('dialog')).toBeTruthy();
        await act(async () => { fireEvent.mouseDown(container.ownerDocument.querySelector('.sexta-modal-fundo')); });
        await expect(p).resolves.toBe(false);
    });
    it('botao X (Fechar) resolve false', async () => {
        montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'x' }));
        await act(async () => { fireEvent.click(screen.getByLabelText('Fechar')); });
        await expect(p).resolves.toBe(false);
    });
});

describe('DialogosSexta - pedirTexto / pedirTextos', () => {
    it('pedirTexto resolve o texto digitado (botao OK)', async () => {
        montar();
        const p = abrir(() => api.pedirTexto({ titulo: 'Nome', rotulo: 'Seu nome' }));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Ana' } });
        await act(async () => { fireEvent.click(screen.getByText('OK')); });
        await expect(p).resolves.toBe('Ana');
    });
    it('valorInicial e placeholder aparecem; rotulo cai no titulo quando ausente', async () => {
        montar();
        const p = abrir(() => api.pedirTexto({ titulo: 'Titulo X', valorInicial: 'inicial', placeholder: 'dica' }));
        const input = screen.getByRole('textbox');
        expect(input.value).toBe('inicial');
        expect(input.placeholder).toBe('dica');
        expect(screen.getAllByText('Titulo X').length).toBeGreaterThanOrEqual(2);
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await p;
    });
    it('pedirTexto: Cancelar resolve null', async () => {
        montar();
        const p = abrir(() => api.pedirTexto({ titulo: 'Nome', valorInicial: 'abc' }));
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await expect(p).resolves.toBeNull();
    });
    it('pedirTexto: Esc resolve null', async () => {
        montar();
        const p = abrir(() => api.pedirTexto({ titulo: 'Nome', valorInicial: 'abc' }));
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        await expect(p).resolves.toBeNull();
    });
    it('OK fica desabilitado com campo vazio ou so espacos e habilita ao digitar', async () => {
        montar();
        const p = abrir(() => api.pedirTexto({ titulo: 'Nome' }));
        const ok = screen.getByText('OK');
        expect(ok.disabled).toBe(true);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
        expect(ok.disabled).toBe(true);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: ' x ' } });
        expect(ok.disabled).toBe(false);
        await act(async () => { fireEvent.click(ok); });
        await expect(p).resolves.toBe(' x ');
    });
    it('Enter submete quando valido; Enter com campo vazio nao submete', async () => {
        montar();
        let resolvido = false;
        const p = abrir(() => api.pedirTexto({ titulo: 'Nome' }).then(v => { resolvido = true; return v; }));
        const input = screen.getByRole('textbox');
        fireEvent.keyDown(input, { key: 'Enter' });
        await act(async () => {});
        expect(resolvido).toBe(false);
        fireEvent.change(input, { target: { value: 'Zed' } });
        await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
        await expect(p).resolves.toBe('Zed');
    });
    it('pedirTextos com varios campos resolve array na ordem; OK so habilita com todos preenchidos', async () => {
        montar();
        const p = abrir(() => api.pedirTextos({
            titulo: 'Novo', campos: [{ rotulo: 'Capitulo' }, { rotulo: 'Arco', valorInicial: 'Arco 1' }],
        }));
        const [c1, c2] = screen.getAllByRole('textbox');
        expect(c2.value).toBe('Arco 1');
        expect(screen.getByText('OK').disabled).toBe(true);
        fireEvent.change(c1, { target: { value: 'Cap A' } });
        expect(screen.getByText('OK').disabled).toBe(false);
        fireEvent.change(c2, { target: { value: '' } });
        expect(screen.getByText('OK').disabled).toBe(true);
        fireEvent.change(c2, { target: { value: 'Arco Z' } });
        await act(async () => { fireEvent.keyDown(c2, { key: 'Enter' }); });
        await expect(p).resolves.toEqual(['Cap A', 'Arco Z']);
    });
    it('pedirTextos cancelado resolve null', async () => {
        montar();
        const p = abrir(() => api.pedirTextos({ titulo: 'Novo', campos: [{ rotulo: 'A', valorInicial: 'x' }] }));
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await expect(p).resolves.toBeNull();
    });
    it('foco inicial vai para o primeiro campo', async () => {
        montar();
        const p = abrir(() => api.pedirTexto({ titulo: 'Nome' }));
        expect(document.activeElement).toBe(screen.getByRole('textbox'));
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await p;
    });
});

describe('DialogosSexta - fila', () => {
    it('mostra um dialogo por vez, na ordem de chegada', async () => {
        montar();
        const p1 = abrir(() => api.confirmar({ titulo: 'Um', mensagem: 'primeiro' }));
        const p2 = abrir(() => api.pedirTexto({ titulo: 'Dois', valorInicial: 'v' }));
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByText('primeiro')).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByText('Confirmar')); });
        await expect(p1).resolves.toBe(true);
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('textbox').value).toBe('v');
        await act(async () => { fireEvent.click(screen.getByText('OK')); });
        await expect(p2).resolves.toBe('v');
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('o segundo dialogo comeca com estado proprio (nao herda o texto do primeiro)', async () => {
        montar();
        const p1 = abrir(() => api.pedirTexto({ titulo: 'A' }));
        const p2 = abrir(() => api.pedirTexto({ titulo: 'B' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'digitado' } });
        await act(async () => { fireEvent.click(screen.getByText('OK')); });
        await expect(p1).resolves.toBe('digitado');
        expect(screen.getByRole('textbox').value).toBe('');
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await expect(p2).resolves.toBeNull();
    });
});

describe('DialogosSexta - avisar (toast)', () => {
    it('mostra o aviso com o tipo e some depois de 4 s', () => {
        vi.useFakeTimers();
        montar();
        act(() => { api.avisar('Salvo!'); });
        const t = screen.getByText('Salvo!');
        expect(t.className).toContain('sexta-aviso-ok');
        act(() => { vi.advanceTimersByTime(3999); });
        expect(screen.queryByText('Salvo!')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(2); });
        expect(screen.queryByText('Salvo!')).toBeNull();
    });
    it('tipo erro usa a classe de erro; varios avisos convivem e saem no proprio tempo', () => {
        vi.useFakeTimers();
        montar();
        act(() => { api.avisar('A', 'erro'); });
        act(() => { vi.advanceTimersByTime(2000); });
        act(() => { api.avisar('B'); });
        expect(screen.getByText('A').className).toContain('sexta-aviso-erro');
        expect(screen.getByText('B')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(2001); });
        expect(screen.queryByText('A')).toBeNull();
        expect(screen.queryByText('B')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(2000); });
        expect(screen.queryByText('B')).toBeNull();
    });
    it('aviso nao bloqueia nem entra na fila dos dialogos', async () => {
        montar();
        const p = abrir(() => api.confirmar({ titulo: 'T', mensagem: 'm' }));
        act(() => { api.avisar('toast'); });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByText('toast')).toBeTruthy();
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await p;
    });
});

describe('DialogosSexta - modais empilhados (ModalSexta)', () => {
    function Base({ aoFechar }) {
        return <ModalSexta titulo="Base" aoFechar={aoFechar} rodape={<button>Rodape base</button>}><input aria-label="campo-base" /></ModalSexta>;
    }
    it('Esc fecha so o modal do topo (o confirmar), a base continua aberta', async () => {
        const aoFecharBase = vi.fn();
        montar(<Base aoFechar={aoFecharBase} />);
        const p = abrir(() => api.confirmar({ titulo: 'Topo', mensagem: 'm' }));
        expect(screen.getAllByRole('dialog')).toHaveLength(2);
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        await expect(p).resolves.toBe(false);
        expect(aoFecharBase).not.toHaveBeenCalled();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        // Agora a base e a do topo
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(aoFecharBase).toHaveBeenCalledTimes(1);
    });
    it('Esc numa ModalSexta sozinha chama aoFechar uma vez', () => {
        const aoFechar = vi.fn();
        render(<Base aoFechar={aoFechar} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(aoFechar).toHaveBeenCalledTimes(1);
    });
    it('Tab fica preso no modal do topo (ultimo -> primeiro, Shift+Tab primeiro -> ultimo)', async () => {
        montar(<Base aoFechar={() => {}} />);
        const p = abrir(() => api.confirmar({ titulo: 'Topo', mensagem: 'm' }));
        const dlgs = screen.getAllByRole('dialog');
        const topo = dlgs[dlgs.length - 1];
        expect(topo.getAttribute('aria-label')).toBe('Topo');
        const botoes = [...topo.querySelectorAll('button')];
        const primeiro = botoes[0]; const ultimo = botoes[botoes.length - 1];
        ultimo.focus();
        const ev = fireEvent.keyDown(document, { key: 'Tab' });
        expect(ev).toBe(false); // preventDefault chamado
        expect(document.activeElement).toBe(primeiro);
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(ultimo);
        // Foco fora do topo (na base) volta para dentro do topo
        screen.getByLabelText('campo-base').focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(topo.contains(document.activeElement)).toBe(true);
        await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
        await p;
    });
    it('Tab no meio da lista nao e interceptado', async () => {
        render(<ModalSexta titulo="M" aoFechar={() => {}}><input aria-label="a" /><input aria-label="b" /><input aria-label="c" /></ModalSexta>);
        screen.getByLabelText('b').focus();
        const ev = fireEvent.keyDown(document, { key: 'Tab' });
        expect(ev).toBe(true);
    });
    it('depois de fechar o topo, o Tab prende na base de novo', async () => {
        montar(<Base aoFechar={() => {}} />);
        const p = abrir(() => api.confirmar({ titulo: 'Topo', mensagem: 'm' }));
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        await p;
        const base = screen.getByRole('dialog');
        const itens = [...base.querySelectorAll('input, button')];
        itens[itens.length - 1].focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(itens[0]);
    });
    it('ao desmontar/fechar o modal, o foco volta para o elemento anterior', () => {
        const botao = document.createElement('button');
        document.body.appendChild(botao);
        botao.focus();
        const { unmount } = render(<Base aoFechar={() => {}} />);
        expect(document.activeElement).not.toBe(botao);
        unmount();
        expect(document.activeElement).toBe(botao);
        botao.remove();
    });
    it('ModalSexta sem rodape nao renderiza o bloco de rodape; foco inicial cai no botao X', () => {
        const { container } = render(<ModalSexta titulo="Sem" aoFechar={() => {}}><p>oi</p></ModalSexta>);
        expect(container.querySelector('.sexta-modal-rodape')).toBeNull();
        expect(document.activeElement.getAttribute('aria-label')).toBe('Fechar');
    });
    it('largura vira classe', () => {
        const { container } = render(<ModalSexta titulo="L" largura="larga" aoFechar={() => {}} />);
        expect(container.querySelector('.sexta-modal-larga')).toBeTruthy();
    });
});

describe('DialogosSexta - desmontar o provider', () => {
    it('resolve dialogos pendentes como cancelamento (false / null)', async () => {
        const { unmount } = montar();
        const p1 = abrir(() => api.confirmar({ titulo: 'a', mensagem: 'm' }));
        const p2 = abrir(() => api.pedirTexto({ titulo: 'b' }));
        const p3 = abrir(() => api.pedirTextos({ titulo: 'c', campos: [{ rotulo: 'x' }] }));
        unmount();
        await expect(p1).resolves.toBe(false);
        await expect(p2).resolves.toBeNull();
        await expect(p3).resolves.toBeNull();
    });
    it('dialogos ja respondidos nao sao resolvidos de novo (mantem o valor original)', async () => {
        const { unmount } = montar();
        const p = abrir(() => api.confirmar({ titulo: 'a', mensagem: 'm' }));
        await act(async () => { fireEvent.click(screen.getByText('Confirmar')); });
        unmount();
        await expect(p).resolves.toBe(true);
    });
});

describe('useDialogosSexta - fallback sem provider', () => {
    const usar = () => renderHook(() => useDialogosSexta()).result.current;
    it('confirmar usa window.confirm (mensagem, senao titulo)', async () => {
        const c = vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
        const d = usar();
        await expect(d.confirmar({ titulo: 'T', mensagem: 'Msg' })).resolves.toBe(true);
        expect(c).toHaveBeenLastCalledWith('Msg');
        await expect(d.confirmar({ titulo: 'Só título' })).resolves.toBe(false);
        expect(c).toHaveBeenLastCalledWith('Só título');
    });
    it('pedirTexto usa window.prompt (rotulo/valorInicial) e devolve null no cancelamento', async () => {
        const p = vi.spyOn(window, 'prompt').mockReturnValueOnce('abc').mockReturnValueOnce(null);
        const d = usar();
        await expect(d.pedirTexto({ titulo: 'T', rotulo: 'R', valorInicial: 'v' })).resolves.toBe('abc');
        expect(p).toHaveBeenCalledWith('R', 'v');
        await expect(d.pedirTexto({ titulo: 'T' })).resolves.toBeNull();
        expect(p).toHaveBeenLastCalledWith('T', '');
    });
    it('pedirTextos pergunta campo a campo e aborta com null no primeiro cancelamento', async () => {
        const p = vi.spyOn(window, 'prompt').mockReturnValueOnce('a').mockReturnValueOnce('b')
            .mockReturnValueOnce('c').mockReturnValueOnce(null);
        const d = usar();
        const campos = [{ rotulo: 'R1' }, { rotulo: 'R2', valorInicial: 'x' }];
        await expect(d.pedirTextos({ titulo: 'T', campos })).resolves.toEqual(['a', 'b']);
        expect(p).toHaveBeenNthCalledWith(2, 'R2', 'x');
        await expect(d.pedirTextos({ titulo: 'T', campos })).resolves.toBeNull();
    });
    it('pedirTextos sem campos resolve array vazio', async () => {
        await expect(usar().pedirTextos({ titulo: 'T' })).resolves.toEqual([]);
    });
    it('avisar usa window.alert', () => {
        const a = vi.spyOn(window, 'alert').mockImplementation(() => {});
        usar().avisar('oi', 'erro');
        expect(a).toHaveBeenCalledWith('oi');
    });
});
