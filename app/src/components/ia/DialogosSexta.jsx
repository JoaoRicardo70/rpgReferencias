import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// 🪟 MODAIS DA SEXTA-FEIRA: substituem window.prompt / confirm / alert na aba da IA por janelas no
// tema neon. API por Promise, pra trocar uma chamada do navegador por outra sem reescrever a lógica:
//   pedirTextos({ titulo, campos: [{ rotulo, valorInicial, placeholder }] }) -> string[] | null
//   pedirTexto({ titulo, rotulo, valorInicial })                          -> string | null
//   confirmar({ titulo, mensagem, textoConfirmar, perigo })                -> boolean
//   avisar(mensagem, tipo = 'ok' | 'erro')                                 -> aviso rápido (toast)
// Fora do DialogosSextaProvider (ex.: testes que montam só o AIFormProvider), cai nas janelas do
// próprio navegador, com o mesmo comportamento de antes.

const DialogosContext = createContext(null);

const FALLBACK_NAVEGADOR = {
    pedirTextos: async ({ titulo, campos }) => {
        const valores = [];
        for (const campo of campos || []) {
            const v = window.prompt(campo.rotulo || titulo, campo.valorInicial ?? '');
            if (v === null || v === undefined) return null;
            valores.push(v);
        }
        return valores;
    },
    pedirTexto: async ({ titulo, rotulo, valorInicial }) => {
        const v = window.prompt(rotulo || titulo, valorInicial ?? '');
        return v === undefined ? null : v;
    },
    confirmar: async ({ mensagem, titulo }) => window.confirm(mensagem || titulo),
    avisar: (mensagem) => { window.alert(mensagem); },
};

export function useDialogosSexta() {
    return useContext(DialogosContext) || FALLBACK_NAVEGADOR;
}

// Modais abertos, do mais antigo pro mais novo: Esc e o Tab preso valem só para o do topo (ex.:
// um "confirmar" aberto por cima da janela de Versões fecha sozinho, sem levar a de baixo junto).
const pilhaModais = [];
let proximoIdModal = 0;
const FOCAVEIS = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';

// Janela base (também usada pelas telas de Versões e Lixeira dos Registros).
export function ModalSexta({ titulo, aoFechar, children, rodape, largura = 'normal' }) {
    const caixaRef = useRef(null);
    // Ref: o foco inicial e o teclado são montados uma vez só, mesmo se aoFechar mudar a cada render.
    const aoFecharRef = useRef(aoFechar);
    aoFecharRef.current = aoFechar;
    useEffect(() => {
        proximoIdModal += 1;
        const id = proximoIdModal;
        pilhaModais.push(id);
        const aoTeclar = (e) => {
            if (pilhaModais[pilhaModais.length - 1] !== id) return;
            if (e.key === 'Escape') { e.preventDefault(); aoFecharRef.current?.(); return; }
            if (e.key === 'Tab' && caixaRef.current) {
                // Foco preso dentro da janela (aria-modal).
                const itens = [...caixaRef.current.querySelectorAll(FOCAVEIS)].filter(el => !el.disabled);
                if (itens.length === 0) return;
                const primeiro = itens[0]; const ultimo = itens[itens.length - 1];
                if (e.shiftKey && (document.activeElement === primeiro || !caixaRef.current.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && (document.activeElement === ultimo || !caixaRef.current.contains(document.activeElement))) { e.preventDefault(); primeiro.focus(); }
            }
        };
        document.addEventListener('keydown', aoTeclar);
        const anterior = document.activeElement;
        // Foco inicial: primeiro campo; sem campo, o primeiro botão do rodapé (Cancelar/Fechar).
        const alvo = caixaRef.current?.querySelector('.sexta-modal-corpo input, .sexta-modal-corpo textarea, .sexta-modal-corpo select')
            || caixaRef.current?.querySelector('.sexta-modal-rodape button')
            || caixaRef.current?.querySelector('button');
        alvo?.focus();
        return () => {
            document.removeEventListener('keydown', aoTeclar);
            const pos = pilhaModais.indexOf(id);
            if (pos >= 0) pilhaModais.splice(pos, 1);
            if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus();
        };
    }, []);
    return (
        <div className="sexta-modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar?.(); }}>
            <div ref={caixaRef} className={`sexta-modal sexta-modal-${largura}`} role="dialog" aria-modal="true" aria-label={titulo}>
                <div className="sexta-modal-topo">
                    <h3 className="sexta-modal-titulo">{titulo}</h3>
                    <button type="button" className="sexta-modal-fechar" onClick={aoFechar} aria-label="Fechar">✕</button>
                </div>
                <div className="sexta-modal-corpo">{children}</div>
                {rodape && <div className="sexta-modal-rodape">{rodape}</div>}
            </div>
        </div>
    );
}

function DialogoAtual({ dialogo, resolver }) {
    const [valores, setValores] = useState(() => (dialogo.campos || []).map(c => c.valorInicial ?? ''));
    const cancelar = useCallback(() => resolver(dialogo.tipo === 'confirmar' ? false : null), [dialogo.tipo, resolver]);
    const ok = () => resolver(dialogo.tipo === 'confirmar' ? true : valores);
    const podeOk = dialogo.tipo === 'confirmar' || valores.every(v => String(v).trim());
    return (
        <ModalSexta
            titulo={dialogo.titulo}
            aoFechar={cancelar}
            rodape={(
                <>
                    <button type="button" className="btn-neon sexta-modal-btn" onClick={cancelar}>Cancelar</button>
                    <button type="button" className={`btn-neon sexta-modal-btn ${dialogo.perigo ? 'btn-red' : 'btn-green'}`} onClick={ok} disabled={!podeOk}>
                        {dialogo.textoConfirmar || (dialogo.tipo === 'confirmar' ? 'Confirmar' : 'OK')}
                    </button>
                </>
            )}
        >
            {dialogo.mensagem && <p className="sexta-modal-mensagem">{dialogo.mensagem}</p>}
            {(dialogo.campos || []).map((campo, i) => (
                <label key={i} className="sexta-modal-campo">
                    <span>{campo.rotulo}</span>
                    <input
                        className="input-neon"
                        value={valores[i]}
                        placeholder={campo.placeholder || ''}
                        onChange={e => { const v = e.target.value; setValores(prev => prev.map((x, j) => (j === i ? v : x))); }}
                        onKeyDown={e => { if (e.key === 'Enter' && podeOk) { e.preventDefault(); ok(); } }}
                    />
                </label>
            ))}
        </ModalSexta>
    );
}

export function DialogosSextaProvider({ children }) {
    const [fila, setFila] = useState([]);
    const [avisos, setAvisos] = useState([]);
    const idRef = useRef(0);
    const pendentesRef = useRef([]);

    const abrir = useCallback((dialogo) => new Promise((resolve) => {
        idRef.current += 1;
        const novo = { ...dialogo, id: idRef.current, resolve };
        pendentesRef.current.push(novo);
        setFila(prev => [...prev, novo]);
    }), []);

    // Se a aba fechar com janelas pendentes, elas contam como "Cancelar" (ninguém fica esperando).
    useEffect(() => () => {
        pendentesRef.current.forEach(d => d.resolve(d.tipo === 'confirmar' ? false : null));
        pendentesRef.current = [];
    }, []);

    const responder = useCallback((dialogo, valor) => {
        pendentesRef.current = pendentesRef.current.filter(d => d.id !== dialogo.id);
        dialogo.resolve(valor);
        setFila(prev => prev.filter(x => x.id !== dialogo.id));
    }, []);

    const avisar = useCallback((mensagem, tipo = 'ok') => {
        idRef.current += 1;
        const id = idRef.current;
        setAvisos(prev => [...prev, { id, mensagem, tipo }]);
        setTimeout(() => setAvisos(prev => prev.filter(a => a.id !== id)), 4000);
    }, []);

    const api = useMemo(() => ({
        pedirTextos: ({ titulo, campos, mensagem }) => abrir({ tipo: 'texto', titulo, campos, mensagem }),
        pedirTexto: async ({ titulo, rotulo, valorInicial, placeholder, mensagem }) => {
            const r = await abrir({ tipo: 'texto', titulo, mensagem, campos: [{ rotulo: rotulo || titulo, valorInicial, placeholder }] });
            return r ? r[0] : null;
        },
        confirmar: ({ titulo, mensagem, textoConfirmar, perigo }) => abrir({ tipo: 'confirmar', titulo, mensagem, textoConfirmar, perigo }),
        avisar,
    }), [abrir, avisar]);

    const atual = fila[0];
    return (
        <DialogosContext.Provider value={api}>
            {children}
            {atual && <DialogoAtual key={atual.id} dialogo={atual} resolver={(v) => responder(atual, v)} />}
            {avisos.length > 0 && (
                <div className="sexta-avisos" role="status" aria-live="polite">
                    {avisos.map(a => <div key={a.id} className={`sexta-aviso sexta-aviso-${a.tipo}`}>{a.mensagem}</div>)}
                </div>
            )}
        </DialogosContext.Provider>
    );
}
