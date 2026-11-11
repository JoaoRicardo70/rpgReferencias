import { normalizarTipoAcao } from '../../core/acoesTecnica';
import { CATEGORIAS_PODER, categoriasVisiveisNaFicha, categoriaDoPoderFicha, idCategoriaPoder, usaMaestriaRequerida } from '../../core/categoriasPoder';
import { lerRespostaDaIA, prepararImportacao, montarPoderFinal } from '../../core/importadorIA';
import { normalizarQuando, normalizarQuandoMultiplicador, ehPropriedadeMultiplicador, normalizarEscopo, ATRIBUTOS_COM_QUANDO, ATRIBUTOS_COM_ESCOPO, ATRIBUTOS_COM_ESCOPO_ESTADO } from '../../core/efeitosCondicionais';
import { normalizarUsos, limiteDeUsos, podeUsar, gastarUso, descreverUsos } from '../../core/usosPoder';
import { normalizarCustoPorTurno } from '../../core/custoPorTurno';
import { normalizarRecarga, emRecarga, mensagemRecarga, iniciarRecarga } from '../../core/recargaPoder';
import { rolarAoDesligar, aplicarDanoEmSiMesmo } from '../../core/aoDesligar';
import React, { createContext, useContext, useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { getMaximo } from '../../core/attributes';
import { uploadImagem, enviarParaFeed } from '../../services/firebase-sync';
import { useFichaAtiva, useCallSaveAtivo, useSalvarImediatoAtivo } from '../Ficha Def/FichaAlvoContext';
import { normalizarPasta, listarCaminhosPastas, renomearCaminhoPasta, migrarChavesPastasAbertas, chavesComPastasMae, chavePastaAberta, NOME_SEM_PASTA } from '../../core/pastas';
// 🔥 CORREÇÃO: a matemática "segura" que substituiu capturarMaximosAtuais/rescalarVitaisProporcional
// aqui na verdade misturava escalas -- comparava `ficha[v].atual` (SEMPRE guardado na escala
// COMPRIMIDA de calcVitalScale) contra `getMaximo(ficha, v)` (escala BRUTA/descomprimida) pra tirar
// uma "%", produzindo uma porcentagem errada sempre que o Máximo bruto do personagem já tivesse
// cruzado uma fronteira de compressão -- exatamente a população de personagens fortes/ascendidos
// pra quem essa compressão existe. `capturarMaximosAtuais`/`rescalarVitaisProporcional` (usadas
// corretamente em `arsenal/ArsenalFormContext.jsx`) já fazem essa conta na escala certa e têm testes
// dedicados (`core/vitals.rescalarVitais.test.js`) -- voltamos a usá-las.
import { getVitalMxDisplay, capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals';
import { calcularGanhoFadigaOvercharge, calcularMultiplicadorOvercharge } from '../../core/dominios';
import { calcularGanhoFadigaMaestriaInsuficiente } from '../../core/fadiga';
import { definirEstagio, mudarContador, contadoresDoPoder, contadoresAvulsos, listaDeContadores, novoIdContador, normalizarContadorRascunho, referenciasDoContador, semReferenciasDoContador, planejarContadoresDoPoder, aplicarContadoresDoPoder, LIMITE_CONTADORES } from '../../core/contadores';
import { sincronizarEscudoDoPoder, normalizarEscudoAoLigar } from '../../core/escudos';
import { normalizarGatilhos } from '../../core/gatilhos';
import { conferirLimitesProgressao } from '../../core/receitasProgressao';
import { dispararEventoNaFicha, forcarGatilhoNaFicha, rngPreSorteado } from '../../core/gatilhosAplicar';
import { ESTAGIOS_PADRAO, normalizarEstagios, limitarEstagio } from '../../core/estagios';
import { SECOES_PADRAO, chaveRascunhoPoder, chaveAbaRascunhoPoder, rascunhoVazio, rascunhoDoPoder, rascunhoTemConteudo, rascunhoTemAlteracao, rascunhoDifere, completarRascunho } from '../../core/rascunhoPoder';

// 🪜 Rascunho do bloco "Estágios" do editor — nomes ficam como texto (um por linha) enquanto edita.
const estagiosEditorVazio = () => ({ ...ESTAGIOS_PADRAO, nomes: '' });

// Singular de cada categoria (lista única em core/categoriasPoder.js).
export const SINGULAR = Object.fromEntries(CATEGORIAS_PODER.map(c => [c.id, c.singular]));

const PoderesFormContext = createContext(null);

export function usePoderesForm() {
    const ctx = useContext(PoderesFormContext);
    if (!ctx) return null;
    return ctx;
}

// 📝 Lê/grava o rascunho na store sem assinar o estado: em testes com useStore simulado (sem getState)
// vira no-op e o formulário se comporta como antes (só em memória do componente).
const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS_PODER.map(c => [c.id, c.nome]));
const lerStoreRascunho = () => (typeof useStore.getState === 'function' ? useStore.getState() : null);
const PASTAS_ABERTAS_VAZIO = {};

// persistirRascunho: o formulário do Grimório (PoderesPanel) guarda o rascunho na store (core/rascunhoPoder.js),
// um por dono da ficha + categoria, pra sobreviver a trocar de página do livro e de aba (Habilidades/Formas/Poderes).
export function PoderesFormProvider({ children, persistirRascunho = false }) {
    // 🔥 GRIMÓRIO DA ENTIDADE: dentro de um FichaAlvoProvider mirando outro personagem (livro do
    // Mestre, components/mestre/LivroEntidade.jsx) tudo aqui lê e grava a ficha DELE; fora disso é a
    // minha ficha, exatamente como sempre (FichaAlvoContext.jsx > useFichaAtiva).
    const { ficha: minhaFicha, updateFicha, nome: meuNome, souEuMesmo } = useFichaAtiva();
    const isMestre = useStore(s => s.isMestre);
    // 📂 Pastas abertas da lista (só em memória, por categoria::caminho): vive na store, não no componente da lista,
    // pra sobreviver a trocar de aba, de página do Grimório e a remontar o livro. Sem nada aberto = tudo fechado.
    const pastasAbertasStore = useStore(s => s.pastasAbertasPoder);
    // Sem a store real (testes com store simulada) cai num estado local, que só dura enquanto o provider estiver montado.
    const [pastasLocais, setPastasLocais] = useState(PASTAS_ABERTAS_VAZIO);
    const pastasAbertas = pastasAbertasStore || pastasLocais;
    const definirPastasAbertas = useCallback((chaves, aberta) => {
        const st = lerStoreRascunho();
        if (typeof st?.definirPastasPoder === 'function') { st.definirPastasPoder(chaves, aberta); return; }
        setPastasLocais(prev => { const prox = { ...prev }; (chaves || []).forEach(c => { if (aberta) prox[c] = true; else delete prox[c]; }); return prox; });
    }, []);
    const alternarPasta = useCallback((chave) => {
        const st = lerStoreRascunho();
        if (typeof st?.alternarPastaPoder === 'function') { st.alternarPastaPoder(chave); return; }
        setPastasLocais(prev => { const prox = { ...prev }; if (prox[chave]) delete prox[chave]; else prox[chave] = true; return prox; });
    }, []);
    const abrirPastaDoPoder = useCallback((categoria, pasta) => {
        const chaves = chavesComPastasMae(categoria, pasta);
        if (!chaves.length) chaves.push(chavePastaAberta(categoria, NOME_SEM_PASTA));
        definirPastasAbertas(chaves, true);
    }, [definirPastasAbertas]);
    const salvarFichaSilencioso = useCallSaveAtivo();
    const salvarFirebaseImediato = useSalvarImediatoAtivo();

    // O rascunho do editor (efeitos e "editando qual") mora na store pra MINHA ficha; para outro
    // personagem fica local, pra não se misturar com o meu editor aberto na minha própria aba.
    const efeitosTempGlobal = useStore(s => s.efeitosTemp);
    const setEfeitosTempGlobal = useStore(s => s.setEfeitosTemp);
    const efeitosTempPassivosGlobal = useStore(s => s.efeitosTempPassivos);
    const setEfeitosTempPassivosGlobal = useStore(s => s.setEfeitosTempPassivos);
    const poderEditandoIdGlobal = useStore(s => s.poderEditandoId);
    const setPoderEditandoIdGlobal = useStore(s => s.setPoderEditandoId);
    const [efeitosTempLocal, setEfeitosTempLocal] = useState([]);
    const [efeitosTempPassivosLocal, setEfeitosTempPassivosLocal] = useState([]);
    const [poderEditandoIdLocal, setPoderEditandoIdLocal] = useState(null);
    const efeitosTemp = souEuMesmo ? efeitosTempGlobal : efeitosTempLocal;
    const setEfeitosTemp = souEuMesmo ? setEfeitosTempGlobal : setEfeitosTempLocal;
    const efeitosTempPassivos = souEuMesmo ? efeitosTempPassivosGlobal : efeitosTempPassivosLocal;
    const setEfeitosTempPassivos = souEuMesmo ? setEfeitosTempPassivosGlobal : setEfeitosTempPassivosLocal;
    const poderEditandoId = souEuMesmo ? poderEditandoIdGlobal : poderEditandoIdLocal;
    const setPoderEditandoId = souEuMesmo ? setPoderEditandoIdGlobal : setPoderEditandoIdLocal;

    const [abaAtual, setAbaAtual] = useState(() => {
        if (!persistirRascunho) return 'habilidade';
        const salva = lerStoreRascunho()?.rascunhosPoder?.[chaveAbaRascunhoPoder(meuNome)];
        return SINGULAR[salva] ? salva : 'habilidade';
    });
    // Seções abertas do acordeão do formulário (só UI; acompanha o rascunho).
    const [secoesAbertas, setSecoesAbertas] = useState(() => ({ ...SECOES_PADRAO }));

    const [nomePoder, setNomePoder] = useState('');
    const [descricaoPoder, setDescricaoPoder] = useState(''); 
    const [poderVertente, setPoderVertente] = useState('');
    const [poderElemento, setPoderElemento] = useState('');
    const [elementosAfetados, setElementosAfetados] = useState(''); 
    const [imagemUrl, setImagemUrl] = useState('');
    const [dadosQtd, setDadosQtd] = useState(0);
    const [dadosFaces, setDadosFaces] = useState(20);
    const [custoPercentual, setCustoPercentual] = useState(0);
    const [custoPercentualMax, setCustoPercentualMax] = useState(0);
    const [tipoAcao, setTipoAcao] = useState('');
    // 🔁 Usos limitados (core/usosPoder.js): vazio/0 = ilimitado.
    const [usosMaxPoder, setUsosMaxPoder] = useState('');
    const [usosPorPoder, setUsosPorPoder] = useState('cena');
    // 🔋 Custo por turno ligado e ⏳ recarga em turnos (core/custoPorTurno.js, core/recargaPoder.js): rascunho do editor.
    const [custoTurnoPoder, setCustoTurnoPoder] = useState({ modo: 'fixo', valor: '', energia: 'mana' });
    const [recargaTurnosPoder, setRecargaTurnosPoder] = useState('');
    const [escudoPoder, setEscudoPoder] = useState({ nome: '', valor: '', tipo: 'escudo' });
    // 🔔 Gatilhos do Poder (core/gatilhos.js): rascunho do editor.
    const [gatilhosPoder, setGatilhosPoder] = useState([]);
    const [gatilhosDescartados, setGatilhosDescartados] = useState([]);
    // 🔢 Contadores deste poder (core/contadores.js): rascunho [{ id, nome, min, max, reset? }]; só vão para ficha.contadores junto com o poder.
    const [contadoresPoder, setContadoresPoder] = useState([]);
    const cenaAtivaId = useStore(s => s.cenario?.ativa) || 'default';
    const [semComoPoder, setSemComoPoder] = useState(false);
    const [danoVerdadeiroPoder, setDanoVerdadeiroPoder] = useState(false);
    const [poderAlcance, setPoderAlcance] = useState(1);
    const [poderArea, setPoderArea] = useState(0);
    const [armaVinculada, setArmaVinculada] = useState('');
    const [maestriaPoder, setMaestriaPoder] = useState(0);
    const [fadigaPorUsoPoder, setFadigaPorUsoPoder] = useState(15);
    const [maestriaRequeridaPoder, setMaestriaRequeridaPoder] = useState(0);
    const [pastaPoder, setPastaPoder] = useState('');
    const [estagiosEditor, setEstagiosEditorBruto] = useState(estagiosEditorVazio);
    const setEstagiosEditor = useCallback((parcial) => setEstagiosEditorBruto(prev => ({ ...prev, ...parcial })), []);
    
    const [nomeEfeito, setNomeEfeito] = useState('');
    const [novoAtr, setNovoAtr] = useState('forca');
    const [novoProp, setNovoProp] = useState('base');
    const [novoVal, setNovoVal] = useState('');
    const [novoQuando, setNovoQuando] = useState('');
    const [novoEscopo, setNovoEscopo] = useState('');
    
    const [nomeEfeitoPassivo, setNomeEfeitoPassivo] = useState('');
    const [novoAtrPassivo, setNovoAtrPassivo] = useState('evasiva');
    const [novoPropPassivo, setNovoPropPassivo] = useState('base');
    const [novoValPassivo, setNovoValPassivo] = useState('');
    const [novoQuandoPassivo, setNovoQuandoPassivo] = useState('');
    const [novoEscopoPassivo, setNovoEscopoPassivo] = useState('');

    const [uploadingImg, setUploadingImg] = useState(false);
    const [vincularAberto, setVincularAberto] = useState(null);

    const [poderPreparandoId, setPoderPreparandoId] = useState(null);
    const [overchargeAtivo, setOverchargeAtivo] = useState(false);

    const formRef = useRef(null);
    const vincularRef = useRef(null);

    useEffect(() => {
        if (!vincularAberto) return;
        const handler = (e) => {
            if (vincularRef.current && !vincularRef.current.contains(e.target)) {
                setVincularAberto(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [vincularAberto]);

    // Monta o efeito com a condição ("quando") e o escopo opcionais; devolve null (e avisa) se algum estiver incompleto.
    // Condição e escopo só valem nos atributos que os leem; valores que sobraram de outro atributo escolhido antes são ignorados.
    const montarEfeitoNovo = useCallback((nome, atributo, propriedade, valor, quando, escopo) => {
        // Multiplicador (mgeral...) aceita só as condições da própria ficha (em_combate, empunhando_arma); as de alvo não valem.
        const ehMult = ehPropriedadeMultiplicador(propriedade);
        const q = ehMult ? normalizarQuandoMultiplicador(quando) : (ATRIBUTOS_COM_QUANDO.includes(atributo) ? normalizarQuando(quando) : '');
        if (q === null && ehMult && normalizarQuando(quando)) { alert('Multiplicador só aceita a condição "Em combate" ou "Empunhando uma arma" (condições do alvo não valem em multiplicador).'); return null; }
        if (q === null) { alert('A condição do efeito está incompleta: escolha o estado, o tipo de arma ou o %.'); return null; }
        let esc = '';
        if (ATRIBUTOS_COM_ESCOPO.includes(atributo)) {
            esc = normalizarEscopo(escopo);
            if (esc === null || escopo === 'teste:') { alert('O escopo do efeito está incompleto: escolha qual teste.'); return null; }
        }
        if (ATRIBUTOS_COM_ESCOPO_ESTADO.includes(atributo)) {
            esc = normalizarEscopo(escopo, atributo);
            if (!esc) { alert('Escolha a qual estado o efeito se aplica (ou "Todos os estados").'); return null; }
        }
        return { nome, atributo, propriedade, valor, ...(q ? { quando: q } : {}), ...(esc ? { escopo: esc } : {}) };
    }, []);

    const addEfeitoTemp = useCallback(() => {
        if (!novoVal || !nomeEfeito.trim()) { alert('Preencha o nome e o valor do efeito!'); return; }
        const efeito = montarEfeitoNovo(nomeEfeito.trim(), novoAtr, novoProp, novoVal, novoQuando, novoEscopo);
        if (!efeito) return;
        setEfeitosTemp([...efeitosTemp, efeito]);
        setNovoVal('');
        setNomeEfeito('');
        setNovoQuando('');
        setNovoEscopo('');
    }, [novoVal, nomeEfeito, novoAtr, novoProp, novoQuando, novoEscopo, efeitosTemp, setEfeitosTemp, montarEfeitoNovo]);

    const removerEfeitoTemp = useCallback((index) => {
        setEfeitosTemp(efeitosTemp.filter((_, i) => i !== index));
    }, [efeitosTemp, setEfeitosTemp]);

    const addEfeitoPassivoTemp = useCallback(() => {
        if (!novoValPassivo || !nomeEfeitoPassivo.trim()) { alert('Preencha o nome e o valor do efeito passivo!'); return; }
        const efeito = montarEfeitoNovo(nomeEfeitoPassivo.trim(), novoAtrPassivo, novoPropPassivo, novoValPassivo, novoQuandoPassivo, novoEscopoPassivo);
        if (!efeito) return;
        setEfeitosTempPassivos([...efeitosTempPassivos, efeito]);
        setNovoValPassivo('');
        setNomeEfeitoPassivo('');
        setNovoQuandoPassivo('');
        setNovoEscopoPassivo('');
    }, [novoValPassivo, nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoQuandoPassivo, novoEscopoPassivo, efeitosTempPassivos, setEfeitosTempPassivos, montarEfeitoNovo]);

    const removerEfeitoPassivoTemp = useCallback((index) => {
        setEfeitosTempPassivos(efeitosTempPassivos.filter((_, i) => i !== index));
    }, [efeitosTempPassivos, setEfeitosTempPassivos]);

    const handleImageUpload = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setUploadingImg(true);
        try {
            const urlPermanente = await uploadImagem(file, `poderes/${meuNome || 'desconhecido'}`);
            setImagemUrl(urlPermanente);
        } catch (err) {
            console.error(err);
            alert('Erro ao enviar a imagem!');
        } finally {
            setUploadingImg(false);
        }
    }, [meuNome]);

    // Aplica um rascunho completo em TODOS os campos do formulário (vazio = limpa tudo).
    const aplicarRascunho = useCallback((bruto) => {
        const r = completarRascunho(bruto);
        setPoderEditandoId(r.poderEditandoId);
        setNomePoder(r.nome);
        setDescricaoPoder(r.descricao);
        setPoderVertente(r.vertente);
        setPoderElemento(r.elemento);
        setElementosAfetados(r.elementosAfetados);
        setImagemUrl(r.imagemUrl);
        setDadosQtd(r.dadosQtd);
        setDadosFaces(r.dadosFaces);
        setCustoPercentual(r.custoPercentual);
        setCustoPercentualMax(r.custoPercentualMax);
        setSemComoPoder(r.semComoPoder);
        setDanoVerdadeiroPoder(r.danoVerdadeiro);
        setTipoAcao(r.tipoAcao);
        setUsosMaxPoder(r.usosMax);
        setUsosPorPoder(r.usosPor);
        setCustoTurnoPoder(r.custoTurno);
        setRecargaTurnosPoder(r.recargaTurnos);
        setEscudoPoder(r.escudo);
        setGatilhosPoder(r.gatilhos);
        setGatilhosDescartados(r.gatilhosDescartados);
        setContadoresPoder(r.contadoresRascunho);
        setPoderAlcance(r.alcance);
        setPoderArea(r.area);
        setArmaVinculada(r.arma);
        setMaestriaPoder(r.maestria);
        setFadigaPorUsoPoder(r.fadigaPorUso);
        // Sem isto, a próxima Habilidade criada herdava a Maestria Requerida da última editada.
        setMaestriaRequeridaPoder(r.maestriaRequerida);
        setPastaPoder(r.pasta);
        setEstagiosEditorBruto(r.estagios);
        setEfeitosTemp(r.efeitos);
        setEfeitosTempPassivos(r.efeitosPassivos);
        setNomeEfeito(r.nomeEfeito);
        setNovoAtr(r.novoAtr);
        setNovoProp(r.novoProp);
        setNovoVal(r.novoVal);
        setNovoQuando(r.novoQuando);
        setNovoEscopo(r.novoEscopo);
        setNomeEfeitoPassivo(r.nomeEfeitoPassivo);
        setNovoAtrPassivo(r.novoAtrPassivo);
        setNovoPropPassivo(r.novoPropPassivo);
        setNovoValPassivo(r.novoValPassivo);
        setNovoQuandoPassivo(r.novoQuandoPassivo);
        setNovoEscopoPassivo(r.novoEscopoPassivo);
        setSecoesAbertas(r.abertas);
    }, [setPoderEditandoId, setEfeitosTemp, setEfeitosTempPassivos]);

    // Descarta o formulário (limpa todos os campos, inclusive o "Quando"/escopo/nome dos efeitos em digitação).
    const cancelarEdicaoPoder = useCallback(() => { aplicarRascunho(rascunhoVazio()); }, [aplicarRascunho]);

    // ===== Rascunho persistente (só com persistirRascunho) =====
    // O estado do formulário continua nos useState acima; a cada mudança uma cópia JSON vai pra store
    // (rascunhosPoder[dono|categoria]) e é recarregada ao remontar ou trocar de categoria.
    const chaveRascunho = persistirRascunho ? chaveRascunhoPoder(meuNome, abaAtual) : null;
    const chaveRascunhoRef = useRef(chaveRascunho);
    chaveRascunhoRef.current = chaveRascunho;
    const fichaRef = useRef(minhaFicha);
    fichaRef.current = minhaFicha;
    const [chaveCarregada, setChaveCarregada] = useState(null);

    // Objeto do rascunho atual (sem serializar nada): só muda de referência quando algum campo muda.
    const rascunhoAtual = useMemo(() => ({
        poderEditandoId: poderEditandoId ?? null,
        nome: nomePoder, descricao: descricaoPoder, vertente: poderVertente, elemento: poderElemento, elementosAfetados, imagemUrl,
        dadosQtd, dadosFaces, custoPercentual, custoPercentualMax, semComoPoder, danoVerdadeiro: danoVerdadeiroPoder, tipoAcao,
        usosMax: usosMaxPoder, usosPor: usosPorPoder, custoTurno: custoTurnoPoder, recargaTurnos: recargaTurnosPoder, escudo: escudoPoder,
        gatilhos: gatilhosPoder, gatilhosDescartados, contadoresRascunho: contadoresPoder,
        alcance: poderAlcance, area: poderArea, arma: armaVinculada,
        maestria: maestriaPoder, fadigaPorUso: fadigaPorUsoPoder, maestriaRequerida: maestriaRequeridaPoder,
        pasta: pastaPoder, estagios: estagiosEditor, efeitos: efeitosTemp, efeitosPassivos: efeitosTempPassivos,
        nomeEfeito, novoAtr, novoProp, novoVal, novoQuando, novoEscopo,
        nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoValPassivo, novoQuandoPassivo, novoEscopoPassivo,
        abertas: secoesAbertas,
    }), [
        poderEditandoId, nomePoder, descricaoPoder, poderVertente, poderElemento, elementosAfetados, imagemUrl,
        dadosQtd, dadosFaces, custoPercentual, custoPercentualMax, semComoPoder, danoVerdadeiroPoder, tipoAcao,
        usosMaxPoder, usosPorPoder, custoTurnoPoder, recargaTurnosPoder, escudoPoder, gatilhosPoder, gatilhosDescartados, contadoresPoder,
        poderAlcance, poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, maestriaRequeridaPoder,
        pastaPoder, estagiosEditor, efeitosTemp, efeitosTempPassivos,
        nomeEfeito, novoAtr, novoProp, novoVal, novoQuando, novoEscopo,
        nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoValPassivo, novoQuandoPassivo, novoEscopoPassivo,
        secoesAbertas,
    ]);
    const rascunhoRef = useRef(rascunhoAtual);
    rascunhoRef.current = rascunhoAtual;
    const chaveCarregadaRef = useRef(null);
    const timerRascunhoRef = useRef(null);
    const rascunhoSujoRef = useRef(false);

    // Grava agora o rascunho pendente na store (clone só aqui, nunca a cada render). Usa a chave JÁ carregada,
    // então um flush na troca de aba/desmontagem ainda cai na chave antiga.
    const gravarRascunho = useCallback(() => {
        if (timerRascunhoRef.current) { clearTimeout(timerRascunhoRef.current); timerRascunhoRef.current = null; }
        if (!rascunhoSujoRef.current) return;
        rascunhoSujoRef.current = false;
        const chave = chaveCarregadaRef.current;
        const st = lerStoreRascunho();
        if (!chave || !st) return;
        const r = rascunhoRef.current;
        if (r.poderEditandoId == null && !rascunhoTemConteudo(r)) st.limparRascunhoPoder?.(chave);
        else st.setRascunhoPoder?.(chave, JSON.parse(JSON.stringify(r)));
    }, []);

    // Ao montar / trocar de dono ou categoria: recarrega o rascunho dessa chave (ou limpa se não houver).
    // Nunca restaura `poderEditandoId` sem os campos, e descarta o id se o poder já não existe na ficha.
    // O cleanup grava o que estiver pendente (troca de aba/dono e desmontagem) antes de carregar a próxima chave.
    useLayoutEffect(() => {
        if (!chaveRascunho) return undefined;
        let r = lerStoreRascunho()?.rascunhosPoder?.[chaveRascunho];
        if (r && typeof r === 'object') {
            r = completarRascunho(r);
            if (r.poderEditandoId != null && !(fichaRef.current?.poderes || []).some(po => po && po.id === r.poderEditandoId)) r.poderEditandoId = null;
        } else {
            r = rascunhoVazio();
        }
        aplicarRascunho(r);
        chaveCarregadaRef.current = chaveRascunho;
        setChaveCarregada(chaveRascunho);
        return () => {
            gravarRascunho();
            chaveCarregadaRef.current = null;
        };
    }, [chaveRascunho]); // eslint-disable-line react-hooks/exhaustive-deps

    // Mudou algo no formulário: agenda a gravação (debounce curto). Só depois de carregar a chave atual,
    // pra não sobrescrever com valores velhos. Sem persistirRascunho não faz nada.
    useEffect(() => {
        if (!chaveRascunho || chaveCarregada !== chaveRascunho) return;
        rascunhoSujoRef.current = true;
        if (timerRascunhoRef.current) clearTimeout(timerRascunhoRef.current);
        timerRascunhoRef.current = setTimeout(gravarRascunho, 300);
    }, [rascunhoAtual, chaveCarregada, chaveRascunho, gravarRascunho]);

    useEffect(() => {
        if (!persistirRascunho) return;
        lerStoreRascunho()?.setRascunhoPoder?.(chaveAbaRascunhoPoder(meuNome), abaAtual);
    }, [persistirRascunho, meuNome, abaAtual]);

    // Há algo escrito que se perderia? Calculado sob demanda (não a cada render), lendo os refs mais recentes.
    const temAlteracaoNaoGravada = useCallback(
        () => rascunhoTemAlteracao(rascunhoRef.current, fichaRef.current?.poderes, fichaRef.current?.contadores),
        []
    );

    // Troca de categoria: com rascunho persistente cada categoria mantém o seu (grava o pendente antes); sem ele, limpa como antes.
    const trocarAba = useCallback((nova) => {
        if (persistirRascunho) gravarRascunho();
        setAbaAtual(nova);
        if (!persistirRascunho) cancelarEdicaoPoder();
    }, [persistirRascunho, gravarRascunho, cancelarEdicaoPoder]);

    // Aba aberta que deixou de existir para esta ficha (liberação retirada, ou o Mestre abriu outra entidade sem a liberação e sem poderes ali): volta para Habilidades.
    // Não rebaixa na carga inicial: a ficha ainda pode ser a padrão, e a aba lembrada do rascunho (ex.: 'infinity') voltaria a ser visível quando a ficha real chegar.
    const abaVistaRef = useRef(null); // { nome, aba } da última vez em que a aba atual estava visível
    const avaliouRef = useRef(false);
    useEffect(() => {
        if (!minhaFicha) return;
        // Só para categorias conhecidas e escondidas (as liberáveis); valor desconhecido não é mexido aqui.
        if (!SINGULAR[abaAtual]) return;
        const visivel = categoriasVisiveisNaFicha(minhaFicha).some(c => c.id === abaAtual);
        const jaAvaliou = avaliouRef.current;
        avaliouRef.current = true;
        if (visivel) { abaVistaRef.current = { nome: meuNome, aba: abaAtual }; return; }
        const vista = abaVistaRef.current;
        const eraVisivel = !!vista && vista.nome === meuNome && vista.aba === abaAtual;
        const trocouDeEntidade = !!vista && vista.nome !== meuNome;
        // Primeira avaliação sem nunca ter visto a aba visível = carga inicial: espera a ficha real.
        if (eraVisivel || trocouDeEntidade || jaAvaliou) {
            abaVistaRef.current = null;
            trocarAba('habilidade');
        }
    }, [minhaFicha, meuNome, abaAtual, trocarAba]);

    // Botão Cancelar: pede confirmação se há algo escrito (ou alterado, ao reescrever um poder existente).
    const cancelarEdicaoComConfirmacao = useCallback(() => {
        if (temAlteracaoNaoGravada() && !window.confirm('Descartar o que foi escrito neste formulário? Isso não pode ser desfeito.')) return;
        cancelarEdicaoPoder();
    }, [temAlteracaoNaoGravada, cancelarEdicaoPoder]);

    const salvarNovoPoder = useCallback(() => {
        const n = nomePoder.trim();
        if (!n || (!efeitosTemp.length && !efeitosTempPassivos.length && dadosQtd === 0 && !descricaoPoder.trim())) {
            alert('Falta nome ou efeitos (ou dados/descrição)!');
            return;
        }

        const descSafe = descricaoPoder || "";
        const vertSafe = poderVertente || "";
        const elemSafe = poderElemento || "";
        const afetaSafe = elementosAfetados || "";
        const urlSafe = imagemUrl || "";
        const armaSafe = armaVinculada || "";
        // 🪜 Estágios (core/estagios.js): só grava a config quando ligada; desligar apaga tudo.
        const limiteUsos = normalizarUsos(usosMaxPoder, usosPorPoder);
        const custoTurno = normalizarCustoPorTurno(custoTurnoPoder);
        const recargaN = normalizarRecarga(recargaTurnosPoder);
        const escudoLigar = normalizarEscudoAoLigar(escudoPoder);
        const gatilhosSalvos = normalizarGatilhos(gatilhosPoder).gatilhos;
        const estagiosSalvos = estagiosEditor.habilitado ? normalizarEstagios(estagiosEditor) : null;
        const aplicarEstagios = (poder) => {
            if (estagiosSalvos) {
                poder.estagios = estagiosSalvos;
                poder.estagioAtual = limitarEstagio(poder, poder.estagioAtual ?? 1);
            } else {
                delete poder.estagios;
                delete poder.estagioAtual;
            }
        };

        // 🔢 Contadores do poder: confere o limite ANTES de gravar qualquer coisa (tudo ou nada).
        const poderExisteNaFicha = !!poderEditandoId && (fichaRef.current?.poderes || []).some(p => p && p.id === poderEditandoId);
        const previa = planejarContadoresDoPoder(fichaRef.current, poderExisteNaFicha ? poderEditandoId : null, contadoresPoder);
        if (!previa.ok) { alert(previa.erro); return; }
        let bloqueioContadores = '';

        updateFicha((ficha) => {
            if (!ficha.poderes) ficha.poderes = [];
            // Confere de novo contra a ficha viva (o rascunho do Immer): se não couber, o poder também não é gravado.
            const idDoPoder = poderEditandoId && ficha.poderes.some(p => p.id === poderEditandoId) ? poderEditandoId : Date.now();
            const plano = planejarContadoresDoPoder(ficha, idDoPoder, contadoresPoder);
            if (!plano.ok) { bloqueioContadores = plano.erro; return; }

            // Poder em edição que sumiu da ficha (apagado em outra aba/sync): cria um poder novo com o que foi digitado, nunca perde em silêncio.
            if (poderEditandoId && ficha.poderes.some(p => p.id === poderEditandoId)) {
                const ix = ficha.poderes.findIndex(p => p.id === poderEditandoId);
                if (ix !== -1) {
                    ficha.poderes[ix].nome = n;
                    ficha.poderes[ix].descricao = descSafe; 
                    ficha.poderes[ix].vertente = vertSafe; 
                    ficha.poderes[ix].elemento = elemSafe; 
                    ficha.poderes[ix].elementosAfetados = afetaSafe; 
                    ficha.poderes[ix].categoria = abaAtual;
                    ficha.poderes[ix].efeitos = JSON.parse(JSON.stringify(efeitosTemp));
                    ficha.poderes[ix].efeitosPassivos = JSON.parse(JSON.stringify(efeitosTempPassivos));
                    ficha.poderes[ix].imagemUrl = urlSafe;
                    ficha.poderes[ix].dadosQtd = parseInt(dadosQtd) || 0;
                    ficha.poderes[ix].dadosFaces = parseInt(dadosFaces) || 20;
                    ficha.poderes[ix].custoPercentual = parseFloat(custoPercentual) || 0;
                    ficha.poderes[ix].custoPercentualMax = parseFloat(custoPercentualMax) || 0;
                    ficha.poderes[ix].semComoPoder = !!semComoPoder;
                    if (danoVerdadeiroPoder) ficha.poderes[ix].danoVerdadeiro = true; else delete ficha.poderes[ix].danoVerdadeiro;
                    ficha.poderes[ix].tipoAcao = normalizarTipoAcao(tipoAcao);
                    if (limiteUsos) { ficha.poderes[ix].usosMax = limiteUsos.max; ficha.poderes[ix].usosPor = limiteUsos.por; }
                    else { delete ficha.poderes[ix].usosMax; delete ficha.poderes[ix].usosPor; }
                    if (custoTurno) ficha.poderes[ix].custoPorTurno = custoTurno; else delete ficha.poderes[ix].custoPorTurno;
                    if (escudoLigar) ficha.poderes[ix].escudoAoLigar = escudoLigar; else delete ficha.poderes[ix].escudoAoLigar;
                    if (gatilhosSalvos.length > 0) ficha.poderes[ix].gatilhos = gatilhosSalvos; else delete ficha.poderes[ix].gatilhos;
                    if (recargaN > 0) ficha.poderes[ix].recargaTurnos = recargaN;
                    else { delete ficha.poderes[ix].recargaTurnos; delete ficha.poderes[ix].recargaRestante; }
                    ficha.poderes[ix].alcance = parseFloat(poderAlcance) || 1;
                    ficha.poderes[ix].area = parseFloat(poderArea) || 0;
                    ficha.poderes[ix].armaVinculada = armaSafe;
                    if (abaAtual === 'forma') {
                        ficha.poderes[ix].maestria = Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0));
                        ficha.poderes[ix].fadigaPorUso = Math.max(0, parseFloat(fadigaPorUsoPoder) || 0);
                        delete ficha.poderes[ix].maestriaRequerida;
                    } else if (usaMaestriaRequerida(abaAtual)) {
                        // 🎓 Poderes ganharam a MESMA Maestria própria de Habilidades (pedido do
                        // usuário: paridade entre as 3 categorias) — o quanto o personagem já
                        // domina ESTE Poder específico, comparado contra maestriaRequerida (ver
                        // core/fadiga.js > calcularGanhoFadigaMaestriaInsuficiente).
                        ficha.poderes[ix].maestria = Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0));
                        ficha.poderes[ix].maestriaRequerida = Math.min(100, Math.max(0, parseFloat(maestriaRequeridaPoder) || 0));
                        delete ficha.poderes[ix].fadigaPorUso;
                    } else {
                        delete ficha.poderes[ix].maestria;
                        delete ficha.poderes[ix].maestriaRequerida;
                        delete ficha.poderes[ix].fadigaPorUso;
                    }
                    // 🗂️ Pasta: hoje disponível pra QUALQUER categoria (Formas, Habilidades e
                    // Poderes), não só Formas — pedido do usuário pra organizar o Grimório inteiro
                    // (e, por tabela, a lista de Técnicas Rápidas do Mapa) em pastas.
                    ficha.poderes[ix].pasta = normalizarPasta(pastaPoder);
                    aplicarEstagios(ficha.poderes[ix]);
                    aplicarContadoresDoPoder(ficha, idDoPoder, plano);
                }
            } else {
                const novoPoder = {
                    id: idDoPoder,
                    nome: n,
                    descricao: descSafe, 
                    vertente: vertSafe, 
                    elemento: elemSafe, 
                    elementosAfetados: afetaSafe, 
                    categoria: abaAtual,
                    ativa: false,
                    efeitos: JSON.parse(JSON.stringify(efeitosTemp)),
                    efeitosPassivos: JSON.parse(JSON.stringify(efeitosTempPassivos)),
                    imagemUrl: urlSafe,
                    dadosQtd: parseInt(dadosQtd) || 0,
                    dadosFaces: parseInt(dadosFaces) || 20,
                    custoPercentual: parseFloat(custoPercentual) || 0,
                    custoPercentualMax: parseFloat(custoPercentualMax) || 0,
                    semComoPoder: !!semComoPoder,
                    ...(danoVerdadeiroPoder ? { danoVerdadeiro: true } : {}),
                    tipoAcao: normalizarTipoAcao(tipoAcao),
                    ...(limiteUsos ? { usosMax: limiteUsos.max, usosPor: limiteUsos.por } : {}),
                    ...(custoTurno ? { custoPorTurno: custoTurno } : {}),
                    ...(escudoLigar ? { escudoAoLigar: escudoLigar } : {}),
                    ...(gatilhosSalvos.length > 0 ? { gatilhos: gatilhosSalvos } : {}),
                    ...(recargaN > 0 ? { recargaTurnos: recargaN } : {}),
                    alcance: parseFloat(poderAlcance) || 1,
                    area: parseFloat(poderArea) || 0,
                    armaVinculada: armaSafe,
                    // 🗂️ Pasta: disponível pra QUALQUER categoria (ver comentário em cima, no
                    // ramo de edição) — sempre gravada, igual já era só pra Forma antes.
                    pasta: normalizarPasta(pastaPoder),
                    ...(abaAtual === 'forma' ? {
                        maestria: Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0)),
                        fadigaPorUso: Math.max(0, parseFloat(fadigaPorUsoPoder) || 0),
                    } : usaMaestriaRequerida(abaAtual) ? {
                        maestria: Math.min(100, Math.max(0, parseFloat(maestriaPoder) || 0)),
                        maestriaRequerida: Math.min(100, Math.max(0, parseFloat(maestriaRequeridaPoder) || 0))
                    } : {})
                };
                aplicarEstagios(novoPoder);
                ficha.poderes.push(novoPoder);
                aplicarContadoresDoPoder(ficha, idDoPoder, plano);
            }
        });
        if (bloqueioContadores) { alert(bloqueioContadores); return; }
        if (previa.avisos && previa.avisos.length > 0) alert(previa.avisos.join('\n'));

        // O poder gravado fica à vista: a pasta dele (e as pastas-mãe) abre na lista.
        abrirPastaDoPoder(abaAtual, normalizarPasta(pastaPoder));
        const chaveDoSalvamento = chaveRascunho;
        salvarFirebaseImediato().then(() => {
            // Gravou: o rascunho dessa categoria some (mesmo que o livro já tenha mudado de página/aba).
            if (chaveDoSalvamento) lerStoreRascunho()?.limparRascunhoPoder?.(chaveDoSalvamento);
            if (!chaveDoSalvamento || chaveRascunhoRef.current === chaveDoSalvamento) cancelarEdicaoPoder();
        }).catch(() => {
            alert('Erro ao sincronizar no Firebase!');
        });
    }, [nomePoder, efeitosTemp, efeitosTempPassivos, dadosQtd, descricaoPoder, updateFicha, poderEditandoId, poderVertente, poderElemento, elementosAfetados, abaAtual, imagemUrl, dadosFaces, custoPercentual, custoPercentualMax, semComoPoder, tipoAcao, poderAlcance, poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, maestriaRequeridaPoder, pastaPoder, estagiosEditor, usosMaxPoder, usosPorPoder, custoTurnoPoder, recargaTurnosPoder, escudoPoder, gatilhosPoder, contadoresPoder, danoVerdadeiroPoder, cancelarEdicaoPoder, salvarFirebaseImediato, chaveRascunho, abrirPastaDoPoder]);

    // 🔥 O ESCUDO ANTI-DRENAGEM (Resolve a perda acidental de energia ao Ligar a Forma) 🔥
    // `opcoes.semAoDesligar`: desligar por edição/exclusão não cobra o "ao desligar" (core/aoDesligar.js), só o desligar manual.
    const togglePoder = useCallback((id, opcoes) => {
        // 🔁 Usos limitados (core/usosPoder.js): ligar uma técnica sem usos restantes é barrado; ligar gasta 1 uso. Desligar não gasta.
        const atual = (minhaFicha.poderes || []).find(po => po && po.id === id);
        if (atual && !atual.ativa && !podeUsar(minhaFicha, atual, cenaAtivaId)) {
            alert(`"${atual.nome}" já usou todos os usos (${descreverUsos(minhaFicha, atual, cenaAtivaId)}). Eles voltam ao ${limiteDeUsos(atual).por === 'cena' ? 'trocar de cena ou descansar' : 'descansar'}.`);
            return;
        }
        // ⏳ Recarga em turnos (core/recargaPoder.js): ligar de novo só depois de esperar; ligar inicia a contagem.
        if (atual && !atual.ativa && emRecarga(atual)) { alert(mensagemRecarga(atual)); return; }
        // 💥 Ao desligar à mão (core/aoDesligar.js): rola os dados fora do rascunho para o dano não se repetir se o Immer reexecutar.
        const danoAoDesligar = atual && atual.ativa && !(opcoes && opcoes.semAoDesligar) ? rolarAoDesligar(atual) : 0;
        // Dano realmente aplicado no rascunho (o clique pode chegar com `minhaFicha` velho): só ele vai para o Feed.
        let danoAplicado = 0;
        const textosGatilhosDesligar = [];
        let semEspacoEscudo = '';
        updateFicha((ficha) => {
            if (!ficha.poderes) return;
            const p = ficha.poderes.find(po => po.id === id);
            if (!p) return;

            // 1. Antes de ligar/desligar, capturamos os Máximos ESTÁVEIS de cada barra.
            const oldM = capturarMaximosAtuais(ficha);

            // 🔁 Confere os usos também no RASCUNHO: o check de fora usa o último render e pode estar desatualizado (clique duplo, snapshot remoto).
            if (!p.ativa && !podeUsar(ficha, p, cenaAtivaId)) return;
            if (!p.ativa && emRecarga(p)) return;

            // 2. Mudamos o status da forma (o que engatilha o novo Máximo de Status)
            p.ativa = !p.ativa;
            if (p.ativa) { gastarUso(ficha, p, cenaAtivaId); iniciarRecarga(p); }
            // 🛡️ Escudo do Poder (escudoAoLigar): cria ao ligar, remove ao desligar (core/escudos.js).
            if (p.ativa && normalizarEscudoAoLigar(p.escudoAoLigar) && !sincronizarEscudoDoPoder(ficha, p, true)) semEspacoEscudo = p.nome;
            else if (!p.ativa) sincronizarEscudoDoPoder(ficha, p, false);

            // 3. Re-escala "atual" de cada barra pra manter a MESMA % no novo Máximo. (Nada se gasta!)
            rescalarVitaisProporcional(ficha, oldM);
            if (danoAoDesligar > 0 && !p.ativa) danoAplicado = aplicarDanoEmSiMesmo(ficha, danoAoDesligar, { nome: meuNome, cenaId: cenaAtivaId, textos: textosGatilhosDesligar });
            // 🔔 Gatilhos poderLigou / poderDesligou (core/gatilhos.js).
            // Desligar por edição/exclusão (semAoDesligar) não é um desligar "de verdade": não dispara gatilhos.
            if (p.ativa || !(opcoes && opcoes.semAoDesligar)) {
                try { dispararEventoNaFicha(ficha, { tipo: p.ativa ? 'poderLigou' : 'poderDesligou', poderId: String(id) }, { cenaId: cenaAtivaId, nome: meuNome }).textos.forEach(t => textosGatilhosDesligar.push(t)); } catch (e) { console.error('Gatilho de Poder falhou', e); }
            }
        });

        salvarFichaSilencioso();
        if (semEspacoEscudo) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🛡️ Sem espaço para o escudo de ${semEspacoEscudo}` });
        if (textosGatilhosDesligar.length > 0) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🔔 ${textosGatilhosDesligar.join(' · ')}` });
        if (danoAplicado > 0 && atual) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `💥 ${atual.nome} ao desligar causou ${danoAplicado.toLocaleString('pt-BR')} de dano em ${meuNome}` });
    }, [minhaFicha, cenaAtivaId, meuNome, updateFicha, salvarFichaSilencioso]);

    // 🪜 Sobe/desce o estágio (core/estagios.js). Ativa, a técnica muda os máximos na hora — mesmo
    // travamento de vitais do liga/desliga, pra trocar de estágio nunca drenar Vida/Energia.
    // 🔔 O Mestre liga/desliga um gatilho do Poder (campo mestreDesligou: enquanto verdadeiro o gatilho é ignorado).
    const alternarGatilhoMestre = useCallback((poderId, gatilhoId) => {
        if (!isMestre) return; // além de a UI só mostrar o botão ao Mestre
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po && po.id === poderId);
            const g = p && Array.isArray(p.gatilhos) ? p.gatilhos.find(x => x && x.id === gatilhoId) : null;
            if (!g) return;
            if (g.mestreDesligou) delete g.mestreDesligou; else g.mestreDesligou = true;
        });
        salvarFichaSilencioso();
    }, [isMestre, updateFicha, salvarFichaSilencioso]);

    // 🔔 Modo opcional: o DONO e o MESTRE armam/desarmam um gatilho (campo `armado` NO PRÓPRIO gatilho do Poder; persiste, o descanso não mexe).
    // updateFicha do useFichaAtiva já roteia para a ficha que o Mestre abriu.
    const alternarArmadoGatilho = useCallback((poderId, gatilhoId) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po && po.id === poderId);
            const g = p && Array.isArray(p.gatilhos) ? p.gatilhos.find(x => x && x.id === gatilhoId) : null;
            if (!g || g.modo !== 'opcional') return;
            g.armado = g.armado !== true;
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    // 🔔 O Mestre FORÇA o gatilho agora: executa as ações ignorando evento, condições, armado e o limite de usos (não gasta o limite). O feed diz "forçado pelo Mestre".
    const forcarGatilhoMestre = useCallback((poderId, gatilhoId) => {
        if (!isMestre) return;
        const p = (minhaFicha?.poderes || []).find(po => po && po.id === poderId);
        const g = p && Array.isArray(p.gatilhos) ? p.gatilhos.find(x => x && x.id === gatilhoId) : null;
        if (!g) return;
        if (!window.confirm(`Forçar o disparo de "${g.nome}" agora? Ele ignora as condições e o limite de usos.`)) return;
        const rng = rngPreSorteado();
        let r = null;
        try { updateFicha((ficha) => { rng.reiniciar(); r = forcarGatilhoNaFicha(ficha, poderId, gatilhoId, { cenaId: cenaAtivaId, nome: meuNome, rng }); }); } catch (e) { console.error('Forçar gatilho falhou', e); return; }
        if (!r || !r.achou) return;
        salvarFichaSilencioso();
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🔔 ${r.textos.join(' · ')}` });
    }, [isMestre, minhaFicha, updateFicha, salvarFichaSilencioso, cenaAtivaId, meuNome]);

    const mudarEstagioPoder = useCallback((id, novoEstagio) => {
        updateFicha((ficha) => { definirEstagio(ficha, id, novoEstagio); });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const editarPoder = useCallback((id) => {
        const p = (minhaFicha?.poderes || []).find(po => po.id === id);
        if (!p) return;

        const categoria = categoriaDoPoderFicha(p);
        const rascunho = rascunhoDoPoder(p, minhaFicha?.contadores);
        const outraCategoria = !!chaveRascunho && categoria !== abaAtual;

        if (outraCategoria) {
            // O que será sobrescrito é o rascunho da categoria de DESTINO: confirma com base nele.
            const existente = lerStoreRascunho()?.rascunhosPoder?.[chaveRascunhoPoder(meuNome, categoria)];
            if (existente && (rascunhoTemAlteracao(existente, minhaFicha?.poderes, minhaFicha?.contadores) || (existente.poderEditandoId === p.id && rascunhoDifere(existente, rascunho)))
                && !window.confirm('Já existe um rascunho em andamento na aba "' + (ROTULO_CATEGORIA[categoria] || categoria) + '". Ele será substituído pelo conteúdo salvo de "' + p.nome + '". Continuar?')) return;
        } else if (poderEditandoId !== p.id && temAlteracaoNaoGravada() && !window.confirm('Há um rascunho em andamento neste formulário. Descartá-lo para reescrever "' + p.nome + '"?')) {
            return;
        }

        abrirPastaDoPoder(categoria, normalizarPasta(p.pasta));
        if (p.ativa) {
            togglePoder(id, { semAoDesligar: true });
            alert(`A técnica [${p.nome}] foi DESATIVADA temporariamente para edição.`);
        }

        if (outraCategoria) {
            // Outra categoria: deixa o rascunho pronto na chave dela; ao trocar de aba ele é carregado.
            lerStoreRascunho()?.setRascunhoPoder?.(chaveRascunhoPoder(meuNome, categoria), rascunho);
            setAbaAtual(categoria);
        } else {
            setAbaAtual(categoria);
            aplicarRascunho(rascunho);
        }

        if (formRef.current && typeof formRef.current.scrollIntoView === 'function') formRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [minhaFicha, poderEditandoId, temAlteracaoNaoGravada, chaveRascunho, abaAtual, meuNome, aplicarRascunho, togglePoder, abrirPastaDoPoder]);

    // ===== 🔢 Contadores deste poder (core/contadores.js) =====
    // Ficam no rascunho (contadoresPoder) e só são gravados em ficha.contadores junto com o poder (salvarNovoPoder).
    const planoContadores = useMemo(() => planejarContadoresDoPoder(minhaFicha, poderEditandoId, contadoresPoder), [minhaFicha, poderEditandoId, contadoresPoder]);
    const limiteContadoresCheio = planoContadores.total >= LIMITE_CONTADORES;
    const contadoresAvulsosDaFicha = useMemo(() => {
        const noRascunho = new Set(contadoresPoder.map(c => String(c.id)));
        return contadoresAvulsos(minhaFicha).filter(c => !noRascunho.has(String(c.id)));
    }, [minhaFicha, contadoresPoder]);
    // O que o editor de gatilhos oferece: os da ficha (menos os deste poder, que vêm do rascunho) + os do rascunho, todos com o id definitivo.
    const contadoresParaGatilhos = useMemo(() => {
        const meusNaFicha = new Set(contadoresDoPoder(minhaFicha, poderEditandoId).map(c => String(c.id)));
        const noRascunho = new Set(contadoresPoder.map(c => String(c.id)));
        return [...listaDeContadores(minhaFicha).filter(c => !meusNaFicha.has(String(c.id)) && !noRascunho.has(String(c.id))), ...contadoresPoder];
    }, [minhaFicha, poderEditandoId, contadoresPoder]);
    const adicionarContadorPoder = useCallback((dados) => {
        const novo = normalizarContadorRascunho({ ...dados, id: novoIdContador() });
        if (!novo || limiteContadoresCheio) return false;
        setContadoresPoder(prev => [...prev, novo]);
        return true;
    }, [limiteContadoresCheio]);
    const atualizarContadorPoder = useCallback((id, patch) => {
        setContadoresPoder(prev => prev.map(c => (String(c.id) === String(id) ? (normalizarContadorRascunho({ ...c, ...patch, id: c.id }) || c) : c)));
    }, []);
    const vincularContadorPoder = useCallback((id) => {
        const c = contadoresAvulsos(minhaFicha).find(x => String(x.id) === String(id));
        const n = c ? normalizarContadorRascunho(c) : null;
        if (!n) return false;
        setContadoresPoder(prev => (prev.some(x => String(x.id) === String(id)) ? prev : [...prev, n]));
        return true;
    }, [minhaFicha]);
    // Remover pede confirmação quando algum gatilho usa o contador: os gatilhos DESTE poder (no rascunho) são removidos junto;
    // os de outros poderes não são tocados e ficam listados no aviso.
    const removerContadorPoder = useCallback((id) => {
        const c = contadoresPoder.find(x => String(x.id) === String(id));
        if (!c) return;
        const nosMeus = referenciasDoContador(gatilhosPoder, id);
        const emOutros = [];
        (minhaFicha?.poderes || []).forEach((po) => {
            if (!po || po.id === poderEditandoId) return;
            referenciasDoContador(po, id).forEach(g => emOutros.push(`"${g.nome || 'gatilho'}" (em ${po.nome || 'outro poder'})`));
        });
        if (nosMeus.length > 0 || emOutros.length > 0) {
            const lista = [...nosMeus.map(g => `"${g.nome || 'gatilho'}"`), ...emOutros].join(', ');
            const aviso = `O contador "${c.nome}" é usado por: ${lista}.
`
                + (nosMeus.length > 0 ? 'Os gatilhos deste poder que o usam serão removidos do formulário. ' : '')
                + (emOutros.length > 0 ? 'Os de outros poderes não são alterados e vão parar de funcionar até você escolher outro contador neles. ' : '')
                + 'Remover mesmo assim?';
            if (!window.confirm(aviso)) return;
        }
        if (nosMeus.length > 0) setGatilhosPoder(prev => semReferenciasDoContador(prev, id));
        setContadoresPoder(prev => prev.filter(x => String(x.id) !== String(id)));
    }, [contadoresPoder, gatilhosPoder, minhaFicha, poderEditandoId]);
    // 📈 Construtor de Progressão em combate: acrescenta gatilhos + contadores ao RASCUNHO (nada vai para a ficha até "Gravar").
    // `ctxProgressao` dá ao construtor os ids já usados (para não colidir) e os números para checar os limites.
    const ctxProgressao = useMemo(() => ({
        idsGatilhos: gatilhosPoder.map(g => g && g.id).filter(Boolean),
        idsContadores: listaDeContadores(minhaFicha).map(c => c.id).concat(contadoresPoder.map(c => c.id)),
        existentes: { gatilhos: gatilhosPoder.length, contadores: planoContadores.total },
    }), [gatilhosPoder, minhaFicha, contadoresPoder, planoContadores]);
    const adicionarProgressaoRascunho = useCallback((resultado) => {
        const conf = conferirLimitesProgressao(resultado, ctxProgressao.existentes);
        if (!conf.ok) return conf;
        // Duplicados são filtrados DENTRO do updater (estado mais novo); um contador que já existe com o mesmo id é reutilizado (os gatilhos citam esse id).
        setContadoresPoder(prev => {
            const idsC = new Set(prev.map(c => String(c.id)));
            return [...prev, ...resultado.contadores.filter(c => !idsC.has(String(c.id)))];
        });
        setGatilhosPoder(prev => [...prev, ...resultado.gatilhos]);
        return conf;
    }, [ctxProgressao]);
    // +1/−1 no contador JÁ gravado (cartão do poder e resumo da Ficha). Dono da ficha e Mestre editam; jogador não edita ficha alheia.
    const podeEditarContadores = souEuMesmo || isMestre;
    const mudarContadorDoPoder = useCallback((id, delta) => {
        if (!podeEditarContadores) return;
        updateFicha((f) => { mudarContador(f, id, delta); });
        salvarFichaSilencioso();
    }, [podeEditarContadores, updateFicha, salvarFichaSilencioso]);

    const deletarPoder = useCallback((id) => {
        if (!window.confirm('Tem certeza que deseja rasgar esta página permanentemente?')) return;
        const p = (minhaFicha?.poderes || []).find(po => po.id === id);
        if (p && p.ativa) togglePoder(id, { semAoDesligar: true });

        updateFicha((ficha) => { ficha.poderes = (ficha.poderes || []).filter(po => po.id !== id); });
        salvarFichaSilencioso();
    }, [minhaFicha, togglePoder, updateFicha, salvarFichaSilencioso]);

    const vincularArmaAoPoder = useCallback((poderId, armaId) => {
        updateFicha((ficha) => {
            if (!ficha.poderes) return;
            const p = ficha.poderes.find(po => po.id === poderId);
            if (p) p.armaVinculada = armaId;
        });
        setVincularAberto(null);
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    // 🔥 ESCUDOS ANTI-DRENAGEM NO EDITOR DE SUB-FORMAS 🔥
    const salvarFormaPoder = useCallback((poderId, forma) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);

            if (!p.formas) p.formas = [];
            const ix = p.formas.findIndex(f => f.id === forma.id);
            if (ix !== -1) {
                p.formas[ix] = forma;
            } else {
                p.formas.push(forma);
            }

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const deletarFormaPoder = useCallback((poderId, formaId) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);

            p.formas = (p.formas || []).filter(f => f.id !== formaId);
            if (p.formaAtivaId === formaId) p.formaAtivaId = null;

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    // formaId null = desativa a Forma (e zera o modo); configId escolhe o modo ativo.
    const ativarFormaPoder = useCallback((poderId, formaId, configId = null) => {
        updateFicha((ficha) => {
            const p = (ficha.poderes || []).find(po => po.id === poderId);
            if (!p) return;

            const oldM = capturarMaximosAtuais(ficha);

            // Pedir a MESMA forma (e configuração) já ativa desliga; `formaId` nulo também desliga.
            const jaAtiva = formaId && p.formaAtivaId === formaId && (!configId || (p.configAtivaId || null) === configId);
            p.formaAtivaId = jaAtiva ? null : (formaId || null);
            p.configAtivaId = p.formaAtivaId ? (configId || null) : null;

            rescalarVitaisProporcional(ficha, oldM);
        });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const armasEquipadas = useMemo(() => (minhaFicha?.inventario || []).filter(i => i.tipo === 'arma' && i.equipado), [minhaFicha]);
    const poderesGlobais = minhaFicha?.poderes || [];
    const passivas = minhaFicha?.passivas || [];

    const itensFiltrados = useMemo(() => {
        return poderesGlobais.filter(p => {
            // Categoria desconhecida cai em Habilidades (core/categoriasPoder.js): nada some da lista.
            return categoriaDoPoderFicha(p) === abaAtual.toLowerCase();
        });
    }, [poderesGlobais, abaAtual]);

    // 🗂️ Pastas existentes pra sugestão (datalist) no campo Pasta do editor — olha pra TODOS os
    // poderes (Formas, Habilidades e Poderes), não só Formas, já que a Pasta deixou de ser
    // exclusiva de Forma (ver salvarNovoPoder acima).
    const pastasExistentes = useMemo(() => {
        // Inclui as pastas-mãe de cada caminho ("A/B" traz "A" e "A/B") — core/pastas.js.
        return listarCaminhosPastas(poderesGlobais);
    }, [poderesGlobais]);

    // 🗂️ Renomeia (ou remove, se pastaNova vier vazia) uma pasta nos poderes que a usam — nome
    // mantido (renomearPastaForma) por compatibilidade com quem já chama esta função, mas não é
    // mais exclusiva de Forma. `categoria` (opcional) escopa a operação só aos poderes DAQUELA
    // categoria — a UI (PoderesSubComponents.jsx > renomearOuRemoverPasta) sempre passa a aba
    // atual, pra renomear uma pasta na aba Habilidades nunca afetar sem querer uma Forma ou Poder
    // que reusa o mesmo nome de pasta. Omitir `categoria` (ex: chamada direta em testes/scripts)
    // continua renomeando em TODAS as categorias, comportamento original desta função.
    const renomearPastaForma = useCallback((pastaAntiga, pastaNova, categoria) => {
        const novaLimpa = normalizarPasta(pastaNova);
        const catAlvo = categoria ? categoria.toLowerCase() : null;
        updateFicha((ficha) => {
            (ficha.poderes || []).forEach(p => {
                if (!p) return;
                if (catAlvo && categoriaDoPoderFicha(p) !== catAlvo) return;
                // Renomear/mover uma pasta leva as subpastas junto (core/pastas.js > renomearCaminhoPasta).
                const atual = (p.pasta || '').trim();
                const nova = renomearCaminhoPasta(atual, pastaAntiga, novaLimpa);
                if (nova !== atual) p.pasta = nova;
            });
        });
        salvarFichaSilencioso();
        // A pasta renomeada/movida mantém o estado aberto/fechado (e as subpastas também); a apagada perde a chave.
        if (categoria) {
            const atuais = pastasAbertas || {};
            const novas = migrarChavesPastasAbertas(atuais, categoria, pastaAntiga, novaLimpa);
            const fechar = Object.keys(atuais).filter(c => atuais[c] && !novas[c]);
            const abrir = Object.keys(novas).filter(c => !atuais[c]);
            if (fechar.length) definirPastasAbertas(fechar, false);
            if (abrir.length) definirPastasAbertas(abrir, true);
        }
    }, [updateFicha, salvarFichaSilencioso, pastasAbertas, definirPastasAbertas]);

    const relatorioAuditoria = useMemo(() => {
        const nomesProps = { mbase: 'MULT BASE (x)', mgeral: 'MULT GERAL (x)', mformas: 'MULT FORMA (x)', mabs: 'MULT ABSOLUTO (x)', munico: 'MULT UNICO (x)', base: 'VALOR BRUTO (+)' };
        const mapaEfeitos = { mbase: [], mgeral: [], mformas: [], mabs: [], munico: [], base: [], especial: [] };

        const coletarEfeitos = (nome, efeitos) => {
            if (!efeitos) return;
            efeitos.forEach(ef => {
                const txt = { nome, atributo: ef.atributo, valor: ef.valor };
                if (mapaEfeitos[ef.propriedade]) mapaEfeitos[ef.propriedade].push(txt);
                else mapaEfeitos.especial.push(txt);
            });
        };

        poderesGlobais.forEach(p => { if (p && p.efeitosPassivos) coletarEfeitos(p.nome, p.efeitosPassivos); });
        passivas.forEach(p => { if (p && p.efeitos) coletarEfeitos(p.nome, p.efeitos); });

        let hasContent = false;
        const sections = [];
        for (const prop in nomesProps) {
            if (mapaEfeitos[prop].length > 0) {
                hasContent = true;
                sections.push(
                    <div key={prop} style={{ marginBottom: 6 }}>
                        <strong>{nomesProps[prop]}:</strong>{' '}
                        {mapaEfeitos[prop].map((t, i) => (
                            <span key={i}>
                                {i > 0 && <strong> + </strong>}
                                <span>{t.nome}</span>
                                <span style={{ opacity: 0.6, fontStyle: 'italic' }}> ({(t.atributo || '').toUpperCase()}: {t.valor})</span>
                            </span>
                        ))}
                    </div>
                );
            }
        }
        if (mapaEfeitos.especial.length > 0) {
            hasContent = true;
            sections.push(
                <div key="especial" style={{ marginBottom: 6 }}>
                    <strong>OUTROS EFEITOS:</strong>{' '}
                    {mapaEfeitos.especial.map((t, i) => (
                        <span key={i}>
                            {i > 0 && <strong> + </strong>}
                            <span>{t.nome}</span>
                            <span style={{ opacity: 0.6, fontStyle: 'italic' }}> ({(t.atributo || '').toUpperCase()}: {t.valor})</span>
                        </span>
                    ))}
                </div>
            );
        }
        if (!hasContent) return null;
        return sections;
    }, [poderesGlobais, passivas]);

    const getAtualVital = useCallback((key) => {
        if (!minhaFicha) return 0;
        const max = getMaximo(minhaFicha, key);
        if (minhaFicha[key] && minhaFicha[key].atual !== undefined) return minhaFicha[key].atual;
        return max;
    }, [minhaFicha]);

    const curMana = getAtualVital('mana');
    const curAura = getAtualVital('aura');
    const curChakra = getAtualVital('chakra');
    const energiaElemental = curMana + curAura + curChakra;
    const danoBruto = minhaFicha?.dano?.danoBruto || 0;

    const dispararAtaque = useCallback((poder) => {
        let custoFinalPerc = poder.custoPercentual || 0;
        const vertenteLower = (poder.vertente || '').toLowerCase();
        const isHabilidadeElemental = vertenteLower.includes('elemental');
        const multOvercharge = isHabilidadeElemental ? calcularMultiplicadorOvercharge(minhaFicha, poder.elemento) : 2;
        const overchargeGeraFadiga = isHabilidadeElemental && overchargeAtivo;

        if (isHabilidadeElemental) {
            custoFinalPerc = overchargeAtivo ? ((parseFloat(poder.custoPercentual) || 0) * multOvercharge) : 0;
        }

        // 🎓 Maestria insuficiente gera Fadiga instantânea em Habilidades E Poderes (Poderes
        // ganharam a mesma Maestria de Habilidades — pedido do usuário, paridade entre as 3
        // categorias); Formas não entram aqui (a Maestria delas afeta a Fadiga DINÂMICA contínua
        // enquanto a transformação está ativa, ver core/fadiga.js > getFatorFormasAtivas, não este
        // ganho instantâneo por disparo).
        const categoriaId = idCategoriaPoder(poder.categoria);
        const usaMaestriaDeDisparo = !!categoriaId && usaMaestriaRequerida(categoriaId);
        const ganhoFadigaMaestria = (usaMaestriaDeDisparo && (parseFloat(poder.maestriaRequerida) || 0) > 0)
            ? calcularGanhoFadigaMaestriaInsuficiente(poder.maestria, poder.maestriaRequerida)
            : 0;

        if (custoFinalPerc > 0 || overchargeGeraFadiga || ganhoFadigaMaestria > 0) {
            updateFicha(ficha => {
                if (custoFinalPerc > 0) {
                    ['mana', 'aura', 'chakra'].forEach(v => {
                        let maxDisplay = getVitalMxDisplay(v, ficha);
                        let drain = Math.floor(maxDisplay * (custoFinalPerc / 100));
                        let curr = ficha[v]?.atual !== undefined ? ficha[v].atual : maxDisplay;
                        if (!ficha[v]) ficha[v] = {};
                        ficha[v].atual = Math.max(0, curr - drain);
                    });
                }
                if (overchargeGeraFadiga || ganhoFadigaMaestria > 0) {
                    if (!ficha.combate) ficha.combate = {};
                    let ganhoTotal = 0;
                    if (overchargeGeraFadiga) ganhoTotal += calcularGanhoFadigaOvercharge(ficha, poder.elemento);
                    ganhoTotal += ganhoFadigaMaestria;
                    ficha.combate.fadigaExtra = Math.max(0, (Number(ficha.combate.fadigaExtra) || 0) + ganhoTotal);
                }
            });
            salvarFichaSilencioso();
        }

        let msg = `[ ${poder.nome.toUpperCase()} ] disparado!\n\n`;
        msg += `🎲 Dano Base dos Dados: ${poder.dadosQtd}d${poder.dadosFaces}\n`;
        msg += `➕ Dano Bruto da Ficha: +${danoBruto}\n`;

        if (isHabilidadeElemental) {
            msg += `🌪️ Ressonância do Elemento (${poder.elemento}): +${energiaElemental}\n`;
            if (poder.elementosAfetados) msg += `🌊 Afeta/Consome: ${poder.elementosAfetados}\n`;
            if (overchargeAtivo) {
                msg += `\n🔥 OVERCHARGE ATIVADO!\n`;
                // Sem Multiplicador Potencial: os Multiplicadores de Dano agora só valem no Poder Calculado.
                let danoTotalFlat = Math.floor(danoBruto + energiaElemental);
                msg += `💥 Dano Flat Estimado (Sem os dados): ${danoTotalFlat}\n`;
                msg += `🔻 Custo Aplicado: ${custoFinalPerc.toFixed(1)}% drenado da Mana, Aura e Chakra (x${multOvercharge.toFixed(2)}, pelo seu Domínio de ${poder.elemento || '?'}).\n`;
            } else {
                let danoTotalFlat = danoBruto + energiaElemental;
                msg += `💥 Dano Flat Estimado (Sem os dados): ${danoTotalFlat}\n`;
                msg += `💸 Custo: ZERO (Ressonância da Natureza).\n`;
            }
        } else {
            let danoTotalFlat = danoBruto;
            msg += `💥 Dano Flat Estimado (Sem os dados): ${danoTotalFlat}\n`;
            msg += `🔻 Custo Aplicado: ${custoFinalPerc}% drenado das Energias.\n`;
        }

        alert(msg);
        setPoderPreparandoId(null);
        setOverchargeAtivo(false);
    }, [overchargeAtivo, updateFicha, danoBruto, energiaElemental, minhaFicha, salvarFichaSilencioso]);

    // 1) Lê a resposta da IA e devolve a PRÉVIA ({ ok, itens } com avisos e o que não foi aplicado); nada é gravado.
    const lerImportacao = useCallback((jsonString, chaveInicial = 1) => {
        const lido = lerRespostaDaIA(jsonString);
        if (!lido.ok) return lido;
        return { ok: true, itens: prepararImportacao(lido.itens, abaAtual, chaveInicial, minhaFicha) };
    }, [abaAtual, minhaFicha]);

    // 2) Grava na ficha só os itens da prévia que o jogador deixou marcados. Devolve quantos entraram.
    const confirmarImportacao = useCallback((itensPrevia) => {
        const lista = (Array.isArray(itensPrevia) ? itensPrevia : []).filter(it => it && it.marcado && it.valido && it.objeto && String(it.objeto.nome || '').trim());
        if (lista.length === 0) return 0;
        const time = Date.now();
        updateFicha(f => {
            if (!f.poderes) f.poderes = [];
            lista.forEach((it, i) => { f.poderes.push(montarPoderFinal(it.objeto, time + i)); });
        });
        salvarFirebaseImediato().catch(() => {});
        return lista.length;
    }, [updateFicha, salvarFirebaseImediato]);

    // Atalho de uma etapa só (sem prévia): lê e grava tudo o que for válido.
    const injetarJsonDaIA = useCallback((jsonString) => {
        const lido = lerImportacao(jsonString);
        if (!lido.ok) {
            alert(lido.erro);
            return false;
        }
        const total = confirmarImportacao(lido.itens);
        alert(`Sincronização Concluída!\n\n🗡️ Inscritos: ${total}.`);
        return total > 0;
    }, [lerImportacao, confirmarImportacao]);

    const value = useMemo(() => ({
        minhaFicha, meuNome, isMestre, abaAtual, setAbaAtual, trocarAba, secoesAbertas, setSecoesAbertas, rascunhoAtual, cancelarEdicaoComConfirmacao,
        nomePoder, setNomePoder, descricaoPoder, setDescricaoPoder,
        poderVertente, setPoderVertente, poderElemento, setPoderElemento,
        elementosAfetados, setElementosAfetados, 
        imagemUrl, setImagemUrl, dadosQtd, setDadosQtd, dadosFaces, setDadosFaces,
        custoPercentual, setCustoPercentual, custoPercentualMax, setCustoPercentualMax, semComoPoder, setSemComoPoder, danoVerdadeiroPoder, setDanoVerdadeiroPoder, tipoAcao, setTipoAcao, gatilhosPoder, setGatilhosPoder, gatilhosDescartados, contadoresPoder, contadoresParaGatilhos, contadoresAvulsosDaFicha, limiteContadoresCheio, ctxProgressao, adicionarProgressaoRascunho, podeEditarContadores, adicionarContadorPoder, atualizarContadorPoder, vincularContadorPoder, removerContadorPoder, mudarContadorDoPoder, alternarGatilhoMestre, alternarArmadoGatilho, forcarGatilhoMestre, usosMaxPoder, setUsosMaxPoder, usosPorPoder, setUsosPorPoder, custoTurnoPoder, setCustoTurnoPoder, recargaTurnosPoder, setRecargaTurnosPoder, escudoPoder, setEscudoPoder, cenaAtivaId, poderAlcance, setPoderAlcance,
        poderArea, setPoderArea, armaVinculada, setArmaVinculada,
        maestriaPoder, setMaestriaPoder, fadigaPorUsoPoder, setFadigaPorUsoPoder,
        maestriaRequeridaPoder, setMaestriaRequeridaPoder,
        pastaPoder, setPastaPoder, pastasExistentes, renomearPastaForma, pastasAbertas, alternarPasta, definirPastasAbertas,
        estagiosEditor, setEstagiosEditor, mudarEstagioPoder,
        nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal,
        novoQuando, setNovoQuando, novoEscopo, setNovoEscopo, novoQuandoPassivo, setNovoQuandoPassivo, novoEscopoPassivo, setNovoEscopoPassivo,
        nomeEfeitoPassivo, setNomeEfeitoPassivo, novoAtrPassivo, setNovoAtrPassivo,
        novoPropPassivo, setNovoPropPassivo, novoValPassivo, setNovoValPassivo,
        uploadingImg, setUploadingImg, vincularAberto, setVincularAberto,
        poderPreparandoId, setPoderPreparandoId, overchargeAtivo, setOverchargeAtivo,
        formRef, vincularRef,
        addEfeitoTemp, removerEfeitoTemp, addEfeitoPassivoTemp, removerEfeitoPassivoTemp,
        handleImageUpload, salvarNovoPoder, editarPoder, cancelarEdicaoPoder,
        togglePoder, deletarPoder, vincularArmaAoPoder, salvarFormaPoder,
        deletarFormaPoder, ativarFormaPoder,
        armasEquipadas, itensFiltrados, relatorioAuditoria,
        curMana, curAura, curChakra, energiaElemental, danoBruto,
        dispararAtaque, efeitosTemp, efeitosTempPassivos, poderEditandoId,
        injetarJsonDaIA, lerImportacao, confirmarImportacao
    }), [
        minhaFicha, meuNome, isMestre, abaAtual, trocarAba, secoesAbertas, rascunhoAtual, cancelarEdicaoComConfirmacao,
        nomePoder, descricaoPoder, poderVertente, poderElemento, elementosAfetados,
        imagemUrl, dadosQtd, dadosFaces, custoPercentual, custoPercentualMax, semComoPoder, danoVerdadeiroPoder, tipoAcao, gatilhosPoder, contadoresPoder, contadoresParaGatilhos, contadoresAvulsosDaFicha, limiteContadoresCheio, ctxProgressao, adicionarProgressaoRascunho, podeEditarContadores, adicionarContadorPoder, atualizarContadorPoder, vincularContadorPoder, removerContadorPoder, mudarContadorDoPoder, alternarGatilhoMestre, alternarArmadoGatilho, forcarGatilhoMestre, usosMaxPoder, usosPorPoder, custoTurnoPoder, recargaTurnosPoder, escudoPoder, cenaAtivaId, poderAlcance,
        poderArea, armaVinculada, maestriaPoder, fadigaPorUsoPoder, maestriaRequeridaPoder, pastaPoder, pastasExistentes, renomearPastaForma, pastasAbertas, alternarPasta, definirPastasAbertas,
        estagiosEditor, setEstagiosEditor, mudarEstagioPoder,
        nomeEfeito, novoAtr, novoProp, novoVal, novoQuando, novoEscopo, novoQuandoPassivo, novoEscopoPassivo,
        nomeEfeitoPassivo, novoAtrPassivo, novoPropPassivo, novoValPassivo,
        uploadingImg, vincularAberto, poderPreparandoId, overchargeAtivo,
        addEfeitoTemp, removerEfeitoTemp, addEfeitoPassivoTemp, removerEfeitoPassivoTemp,
        handleImageUpload, salvarNovoPoder, editarPoder, cancelarEdicaoPoder,
        togglePoder, deletarPoder, vincularArmaAoPoder, salvarFormaPoder,
        deletarFormaPoder, ativarFormaPoder,
        armasEquipadas, itensFiltrados, relatorioAuditoria,
        curMana, curAura, curChakra, energiaElemental, danoBruto,
        dispararAtaque, efeitosTemp, efeitosTempPassivos, poderEditandoId, injetarJsonDaIA, lerImportacao, confirmarImportacao
    ]);

    return (
        <PoderesFormContext.Provider value={value}>
            {children}
        </PoderesFormContext.Provider>
    );
}