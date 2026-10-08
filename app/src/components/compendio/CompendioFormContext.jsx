import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ELEMENTOS_SISTEMA } from '../../core/elementos.js';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';

const CLASSES_REGULARES_BASE = [
    { id: 'saber', nome: 'Saber', icone: '⚔️', titulo: 'Cavaleiro da Espada', cor: '#0088ff', passiva: 'Resistência Mágica', desc: 'A classe mais equilibrada das sete. Especialistas no domínio de lâminas.', efeito: 'Excelentes atributos base em Força, Constituição e Destreza.', efeitosMatematicos: [{ atributo: 'corpo', propriedade: 'mbase', valor: 0.5 }, { atributo: 'constituicao', propriedade: 'mbase', valor: 0.5 }] },
    { id: 'archer', nome: 'Archer', icone: '🏹', titulo: 'Cavaleiro do Arco', cor: '#ff003c', passiva: 'Ação Independente', desc: 'Especialistas em combate à distância e projéteis.', efeito: 'Possuem bónus massivo em precisão e Letalidade.', efeitosMatematicos: [{ atributo: 'geral', propriedade: 'letalidade', valor: 20 }] },
    { id: 'lancer', nome: 'Lancer', icone: '🗡️', titulo: 'Cavaleiro da Lança', cor: '#00ffcc', passiva: 'Proteção contra Flechas', desc: 'Guerreiros velozes que empunham armas de haste.', efeito: 'Altamente ágeis e letais no corpo a corpo.', efeitosMatematicos: [{ atributo: 'destreza', propriedade: 'mbase', valor: 0.5 }, { atributo: 'stamina', propriedade: 'mbase', valor: 0.5 }] },
    { id: 'rider', nome: 'Rider', icone: '🏇', titulo: 'Cavaleiro de Montaria', cor: '#ff8800', passiva: 'Montaria (Riding)', desc: 'Espíritos associados a grandes lendas de montarias.', efeito: 'Altíssima velocidade de movimento no mapa e evasão.', efeitosMatematicos: [{ atributo: 'geral', propriedade: 'bonus_evasiva', valor: 200 }] },
    { id: 'caster', nome: 'Caster', icone: '🧙‍♂️', titulo: 'Conjurador Magus', cor: '#cc00ff', passiva: 'Criação de Território', desc: 'Estudiosos dos mistérios mágicos e construtores de domínios.', efeito: 'Fracos no corpo a corpo, mas com Inteligência e Sabedoria supremas.', efeitosMatematicos: [{ atributo: 'inteligencia', propriedade: 'mbase', valor: 0.5 }, { atributo: 'sabedoria', propriedade: 'mbase', valor: 0.5 }, { atributo: 'mana', propriedade: 'mbase', valor: 0.5 }] },
    { id: 'assassin', nome: 'Assassin', icone: '🔪', titulo: 'Assassino Furtivo', cor: '#444444', passiva: 'Ocultação de Presença', desc: 'Mestres da furtividade e ataques críticos.', efeito: 'Aumenta permanentemente o multiplicador dos Críticos.', efeitosMatematicos: [{ atributo: 'geral', propriedade: 'criticonormal', valor: 1 }, { atributo: 'geral', propriedade: 'criticofatal', valor: 1 }] },
    { id: 'berserker', nome: 'Berserker', icone: '狂', titulo: 'O Guerreiro Insano', cor: '#ff0000', passiva: 'Mad Enhancement', desc: 'Heróis que sucumbiram à fúria ou à loucura.', efeito: 'Quanto mais HP perde, mais forte fica (Poder Calculado e Status).', efeitosMatematicos: [{ atributo: 'vida', propriedade: 'munico', valor: 1.5 }, { atributo: 'corpo', propriedade: 'munico', valor: 1.5 }, { atributo: 'dano', propriedade: 'furia_berserker', valor: 1.5 }, { atributo: 'todos_status', propriedade: 'furia_berserker', valor: 1.5 }] }
];

const CLASSES_EXTRA_BASE = [
    { id: 'shielder', nome: 'Shielder', icone: '🛡️', titulo: 'O Escudo Protetor', cor: '#00ffff', passiva: 'Frente de Batalha', desc: 'Classe defensiva suprema.', efeito: 'Consegue transferir o dano de aliados para si mesmo e criar barreiras.', efeitosMatematicos: [{ atributo: 'constituicao', propriedade: 'mbase', valor: 1.0 }, { atributo: 'forca', propriedade: 'mbase', valor: 1.0 }, { atributo: 'geral', propriedade: 'bonus_resistencia', valor: 500 }] },
    { id: 'ruler', nome: 'Ruler', icone: '⚖️', titulo: 'O Árbitro Santo', cor: '#ffcc00', passiva: 'Resolução Divina', desc: 'Invocados para manter as regras do mundo.', efeito: 'Recebem metade do dano das 6 classes regulares.', efeitosMatematicos: [{ atributo: 'todos_status', propriedade: 'mbase', valor: 0.5 }] },
    { id: 'avenger', nome: 'Avenger', icone: '⛓️', titulo: 'O Vingador', cor: '#880000', passiva: 'Vingança Eterna', desc: 'Nascidos do ódio e traição.', efeito: 'Multiplicador único de x10 em Status e no Poder Calculado.', efeitosMatematicos: [{ atributo: 'dano', propriedade: 'munico', valor: 10 }, { atributo: 'todos_status', propriedade: 'munico', valor: 10 }] },
    { id: 'alterego', nome: 'Alter Ego', icone: '🎭', titulo: 'O Fragmento de Ego', cor: '#ff00ff', passiva: 'Dualidade', desc: 'Fusão de múltiplos espíritos.', efeito: 'Têm vantagem contra as classes da Cavalaria.', efeitosMatematicos: [{ atributo: 'carisma', propriedade: 'mbase', valor: 0.5 }, { atributo: 'energiaesp', propriedade: 'mbase', valor: 0.5 }] },
    { id: 'foreigner', nome: 'Foreigner', icone: '🐙', titulo: 'O Viajante do Abismo', cor: '#00ff88', passiva: 'Existência Fora do Domínio', desc: 'Conectados a entidades além do universo conhecido.', efeito: 'Resistência passiva a dano psicológico.', efeitosMatematicos: [{ atributo: 'sabedoria', propriedade: 'mbase', valor: 1.0 }] },
    { id: 'mooncancer', nome: 'Moon Cancer', icone: '🌕', titulo: 'A Anomalia Digital', cor: '#8888aa', passiva: 'Erro de Sistema', desc: 'Capazes de corromper as próprias regras do combate.', efeito: 'Causam dano extra aos Avengers.', efeitosMatematicos: [{ atributo: 'inteligencia', propriedade: 'mbase', valor: 1.0 }] },
    { id: 'pretender', nome: 'Pretender', icone: '🤥', titulo: 'O Falso Heroico', cor: '#ffaa00', passiva: 'Engano Perfeito', desc: 'Aqueles que assumem a identidade de outros.', efeito: 'Imunes a habilidades de leitura de status.', efeitosMatematicos: [{ atributo: 'carisma', propriedade: 'mbase', valor: 0.5 }, { atributo: 'destreza', propriedade: 'mbase', valor: 0.5 }] },
    { id: 'beast', nome: 'Beast', icone: '👹', titulo: 'O Mal da Humanidade', cor: '#4a0000', passiva: 'Autoridade da Besta', desc: 'Os Males Originais da humanidade.', efeito: 'Possuem barras de HP massivas.', efeitosMatematicos: [{ atributo: 'pv', propriedade: 'munico', valor: 3.0 }, { atributo: 'pm', propriedade: 'munico', valor: 3.0 }, { atributo: 'dano', propriedade: 'mgeral', valor: 1.0 }] },
    { id: 'savior', nome: 'Savior', icone: '☀️', titulo: 'O Iluminado', cor: '#ffffff', passiva: 'Iluminação', desc: 'Seres messiânicos transcendentes.', efeito: 'Focam-se em curas monumentais.', efeitosMatematicos: [{ atributo: 'aura', propriedade: 'mbase', valor: 2.0 }, { atributo: 'chakra', propriedade: 'mbase', valor: 2.0 }] },
    { id: 'desconhecido', nome: '?', icone: '👤', titulo: 'Identidade Oculta', cor: '#666666', passiva: 'Névoa do Mistério', desc: 'A verdadeira linhagem, classe e intenções desta entidade estão completamente encobertas por sombras ou magia.', efeito: 'Oculta todas as mecânicas reais. Apenas o Mestre conhece a verdade por detrás do véu.', efeitosMatematicos: [] }
];

const CONDICOES_BASE = [
    { id: 'envenenado', nome: 'Envenenado', icone: '🤢', cor: '#00ff00', desc: 'A cada acerto usando veneno, aumenta a eficácia do mesmo, seja dano, efeitos ou condições.' },
    { id: 'queimado', nome: 'Queimado', icone: '🔥', cor: '#ff4400', desc: '• 50% de corta cura por stack.\n• 8d4 de dano a mais por stack.\n• Aumento no custo de Energias para se defender.\n• A partir de X stacks fica Vulnerável.' },
    { id: 'sangrando', nome: 'Sangrando', icone: '🩸', cor: '#ff003c', desc: '• 50% de corta cura por stack.\n• 5d4 de dano a mais por stack.\n• Aumento no custo de Energias para se defender.\n• A cada X stacks aplica 1 nível de Exaustão.' },
    { id: 'imobilizado', nome: 'Imobilizado', icone: '⛓️', cor: '#888888', desc: '• 0 de movimento.\n• Desvantagem em testes que envolvem destreza/força.\n• O atacante tem vantagem no ataque.' },
    { id: 'incapacitado', nome: 'Incapacitado', icone: '☠️', cor: '#444444', desc: '• Perde todas as Formas.\n• Para acordar o alvo deve passar em um teste no turno dele ou ser ajudado.\n• Todos tem dupla vantagem para acertá-lo.' },
    { id: 'exausto', nome: 'Exausto', icone: '😮‍💨', cor: '#aaaaaa', desc: '1: Desvantagem em testes.\n2: O alvo fica Lento.\n3: Desvantagem em ataques.\n4: Cura cortada em 50%.\n5: O alvo fica Imobilizado.\n6: F (Incapacitado).' },
    { id: 'vulneravel', nome: 'Vulnerável', icone: '🛡️', cor: '#ffaa00', desc: '• Metade da Resistência.\n• Desvantagem em teste de Força.' },
    { id: 'amedrontado', nome: 'Amedrontado', icone: '👻', cor: '#8a2be2', desc: '• O alvo não ataca a fonte de medo.\n• Qualquer movimento que o alvo faça deve ser pra longe da fonte de medo.' },
    { id: 'enlouquecido', nome: 'Enlouquecido', icone: '🌀', cor: '#ff00ff', desc: 'A mente do alvo colapsou sob a pressão do paranormal.' },
    { id: 'criogenia', nome: 'Criogenia', icone: '❄️', cor: '#00ffff', desc: '• 50% de corta cura por stack.\n• 5d4 de dano a mais por stack.\n• O alvo fica Lento e depois de X stacks fica imobilizado.' },
    { id: 'necrosado', nome: 'Necrosado', icone: '💀', cor: '#222222', desc: 'O tecido celular do alvo está a apodrecer rapidamente.' },
    { id: 'lento', nome: 'Lento', icone: '🐢', cor: '#aadd00', desc: '• O alvo perde metade do movimento.\n• O alvo perde metade da Evasiva.\n• Desvantagem em teste de Destreza.' },
    { id: 'cegosurdo', nome: 'Cego/Surdo', icone: '🙈', cor: '#dddddd', desc: 'Perda de sentidos vitais. Desvantagens severas de perceção e acerto.' },
    { id: 'petrificado', nome: 'Petrificado', icone: '🗿', cor: '#555555', desc: 'Início: Lento -> Vulnerável -> Imobilizado -> Petrificado (Incapacitado).' },
    { id: 'charmado', nome: 'Charmado', icone: '💖', cor: '#ff66b2', desc: '• O alvo não ataca o ser que o Charmou.\n• O alvo defende o ser que o Charmou.' },
    { id: 'provocado', nome: 'Provocado', icone: '💢', cor: '#ff5500', desc: '• O alvo foca apenas no ser que lhe Provocou.' }
];

const ELEMENTOS_BASE_CLASSICOS = [
    { id: 'fisico', nome: 'Cinético (Físico)', icone: '⚔️', cor: '#cccccc', desc: 'O bom e velho soco na cara ou corte de lâmina.'},
    { id: 'fogo', nome: 'Fogo', icone: '🔥', cor: '#ff4444', desc: 'Dano térmico abrasador. Altamente destrutivo.'},
    { id: 'agua', nome: 'Água', icone: '💧', cor: '#0088ff', desc: 'Dano de impacto fluido e adaptável.'},
    { id: 'raio', nome: 'Relâmpago', icone: '⚡', cor: '#ffcc00', desc: 'Dano elétrico, veloz e incontrolável.'},
    { id: 'gelo', nome: 'Gelo', icone: '❄️', cor: '#00ffff', desc: 'Dano térmico congelante. Causa Criogenia.'},
    { id: 'luz', nome: 'Luz / Divino', icone: '☀️', cor: '#fffbd6', desc: 'Dano celestial absoluto.'},
    { id: 'trevas', nome: 'Trevas', icone: '🌑', cor: '#8800ff', desc: 'Dano corrompido, causa Necrose.'}
];

// Elementos do sistema (core/elementos.js) que ainda não têm texto próprio aqui entram com a descrição vazia.
const ELEMENTOS_BASE = [
    ...ELEMENTOS_BASE_CLASSICOS,
    ...ELEMENTOS_SISTEMA.filter(e => !ELEMENTOS_BASE_CLASSICOS.some(c => c.id === e.id)).map(e => ({ id: e.id, nome: e.nome, icone: e.icone, cor: e.cor, desc: '' }))
];

const REGRAS_BASE = [
    { id: 'limites', titulo: 'Limites Físicos', cor: '#00ffcc', desc: 'Nenhuma entidade mundana pode passar de 99 num status base sem ascender para Grand ou usar equipamentos lendários.' },
    { id: 'sobrecarga', titulo: 'Sobrecarga de Energia', cor: '#ffcc00', desc: 'Gastar mais da metade da reserva máxima de Mana ou Aura num único turno aplica 1 stack de Exaustão automaticamente no final do turno.' },
    { id: 'ataques_opor', titulo: 'Ataques Oportunos', cor: '#ff4444', desc: 'Atacar uma entidade com Exaustão Nível 2 (Imobilizado) garante vantagem dupla nos dados de acerto.' },
    { id: 'blindagem', titulo: 'Blindagem de Boss', cor: '#0088ff', desc: 'Ameaças marcadas como [Boss] ou [Beast] limpam 1 stack de todas as condições no início do seu turno naturalmente.' }
];

const CompendioFormContext = createContext(null);

export function useCompendioForm() {
    const ctx = useContext(CompendioFormContext);
    if (!ctx) return null;
    return ctx;
}

export function CompendioFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const personagens = useStore(s => s.personagens);
    const isMestre = useStore(s => s.isMestre);
    const updateFicha = useStore(s => s.updateFicha);

    const [secaoAtiva, setSecaoAtiva] = useState('classes');
    const [editandoId, setEditandoId] = useState(null);
    const [mesaGrand, setMesaGrand] = useState('presente');

    const [tempNome, setTempNome] = useState('');
    const [tempTitulo, setTempTitulo] = useState('');
    const [tempPassiva, setTempPassiva] = useState('');
    const [tempDesc, setTempDesc] = useState('');
    const [tempEfeito, setTempEfeito] = useState('');
    const [tempIconeUrl, setTempIconeUrl] = useState('');
    const [tempEfeitosMat, setTempEfeitosMat] = useState([]);

    const [editandoItemTipo, setEditandoItemTipo] = useState(null);
    const [tempItem, setTempItem] = useState({});

    // 🔥 NOVO MOTOR DE LEITURA DO COMPÊNDIO (AGORA VARRE TODA A MESA) 🔥
    const overridesCompendio = useMemo(() => {
        let globais = { classes: {}, grands: {}, condicoes: {}, elementos: {}, regras: {} };

        if (personagens) {
            Object.values(personagens).forEach(p => {
                if (p && p.compendioOverrides) {
                    if (p.compendioOverrides.classes) Object.assign(globais.classes, p.compendioOverrides.classes);
                    if (p.compendioOverrides.grands) Object.assign(globais.grands, p.compendioOverrides.grands);
                    if (p.compendioOverrides.condicoes) Object.assign(globais.condicoes, p.compendioOverrides.condicoes);
                    if (p.compendioOverrides.elementos) Object.assign(globais.elementos, p.compendioOverrides.elementos);
                    if (p.compendioOverrides.regras) Object.assign(globais.regras, p.compendioOverrides.regras);
                }
            });
        }

        if (minhaFicha && minhaFicha.compendioOverrides) {
            if (minhaFicha.compendioOverrides.classes) Object.assign(globais.classes, minhaFicha.compendioOverrides.classes);
            if (minhaFicha.compendioOverrides.grands) Object.assign(globais.grands, minhaFicha.compendioOverrides.grands);
            if (minhaFicha.compendioOverrides.condicoes) Object.assign(globais.condicoes, minhaFicha.compendioOverrides.condicoes);
            if (minhaFicha.compendioOverrides.elementos) Object.assign(globais.elementos, minhaFicha.compendioOverrides.elementos);
            if (minhaFicha.compendioOverrides.regras) Object.assign(globais.regras, minhaFicha.compendioOverrides.regras);
        }

        return globais;
    }, [minhaFicha, personagens]);

    const mesclarComOverrides = useCallback((baseArray, tipo) => {
        const overridesObj = overridesCompendio[tipo] || {};
        const map = {};
        baseArray.forEach(item => map[item.id] = { ...item });
        Object.keys(overridesObj).forEach(k => {
            if (overridesObj[k].deletado) {
                delete map[k];
            } else if (map[k]) {
                map[k] = { ...map[k], ...overridesObj[k] };
            } else {
                map[k] = overridesObj[k];
            }
        });
        return Object.values(map);
    }, [overridesCompendio]);

    const regulares = useMemo(() => mesclarComOverrides(CLASSES_REGULARES_BASE, 'classes').filter(c => CLASSES_REGULARES_BASE.find(b=>b.id===c.id) || !c.isExtra), [mesclarComOverrides]);
    const extras = useMemo(() => mesclarComOverrides(CLASSES_EXTRA_BASE, 'classes').filter(c => CLASSES_EXTRA_BASE.find(b=>b.id===c.id) || c.isExtra), [mesclarComOverrides]);
    const todasClasses = useMemo(() => [...regulares, ...extras], [regulares, extras]);
    
    const condicoes = useMemo(() => mesclarComOverrides(CONDICOES_BASE, 'condicoes'), [mesclarComOverrides]);
    const elementos = useMemo(() => mesclarComOverrides(ELEMENTOS_BASE, 'elementos'), [mesclarComOverrides]);
    const regras = useMemo(() => mesclarComOverrides(REGRAS_BASE, 'regras'), [mesclarComOverrides]);

    const grands = useMemo(() => overridesCompendio.grands || {}, [overridesCompendio]);

    const handleDefinirGrand = useCallback((classeId, nomeTitular) => {
        updateFicha(f => {
            if (!f.compendioOverrides) f.compendioOverrides = {};
            if (!f.compendioOverrides.grands) f.compendioOverrides.grands = {};
            f.compendioOverrides.grands[`${classeId}_${mesaGrand}`] = nomeTitular;
            if (nomeTitular) {
                const keyCand = `${classeId}_${mesaGrand}_candidatos`;
                const listaCandidatos = f.compendioOverrides.grands[keyCand] || [];
                if (listaCandidatos.includes(nomeTitular)) {
                    f.compendioOverrides.grands[keyCand] = listaCandidatos.filter(n => n !== nomeTitular);
                }
            }
        });
        salvarFichaSilencioso();
        if (nomeTitular) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🏛️ O Trono da Ascensão (${mesaGrand.toUpperCase()}) ressoou! ${nomeTitular.toUpperCase()} foi coroado(a) como GRAND ${classeId.toUpperCase()}!` });
        else enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🩸 O Trono da Ascensão (${mesaGrand.toUpperCase()}) de GRAND ${classeId.toUpperCase()} está agora VAGO!` });
    }, [updateFicha, mesaGrand]);

    const handleAdicionarCandidato = useCallback((classeId, nomeCandidato) => {
        if (!nomeCandidato) return;
        updateFicha(f => {
            if (!f.compendioOverrides) f.compendioOverrides = {};
            if (!f.compendioOverrides.grands) f.compendioOverrides.grands = {};
            const keyCand = `${classeId}_${mesaGrand}_candidatos`;
            const lista = f.compendioOverrides.grands[keyCand] || [];
            if (!lista.includes(nomeCandidato)) {
                f.compendioOverrides.grands[keyCand] = [...lista, nomeCandidato];
            }
        });
        salvarFichaSilencioso();
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🌟 O sistema reconhece o poder divino! ${nomeCandidato.toUpperCase()} é agora oficialmente um(a) CANDIDATO(A) A GRAND ${classeId.toUpperCase()} (${mesaGrand})!` });
    }, [updateFicha, mesaGrand]);

    const handleRemoverCandidato = useCallback((classeId, nomeCandidato) => {
        updateFicha(f => {
            if (!f.compendioOverrides?.grands) return;
            const keyCand = `${classeId}_${mesaGrand}_candidatos`;
            const lista = f.compendioOverrides.grands[keyCand] || [];
            f.compendioOverrides.grands[keyCand] = lista.filter(n => n !== nomeCandidato);
        });
        salvarFichaSilencioso();
    }, [updateFicha, mesaGrand]);

    const handleDefinirIconeGrand = useCallback((classeId, e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                updateFicha(f => {
                    if (!f.compendioOverrides) f.compendioOverrides = {};
                    if (!f.compendioOverrides.grands) f.compendioOverrides.grands = {};
                    f.compendioOverrides.grands[`${classeId}_${mesaGrand}_icone`] = reader.result;
                });
                salvarFichaSilencioso();
            };
            reader.readAsDataURL(file);
        }
    }, [updateFicha, mesaGrand]);

    const limparIconeGrand = useCallback((classeId) => {
        updateFicha(f => {
            if (f.compendioOverrides?.grands) {
                delete f.compendioOverrides.grands[`${classeId}_${mesaGrand}_icone`];
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha, mesaGrand]);

    const iniciarEdicao = useCallback((classe) => {
        setEditandoId(classe.id); setTempNome(classe.nome || ''); setTempTitulo(classe.titulo || '');
        setTempPassiva(classe.passiva || ''); setTempDesc(classe.desc || ''); setTempEfeito(classe.efeito || '');
        setTempIconeUrl(classe.iconeUrl || ''); setTempEfeitosMat(classe.efeitosMatematicos ? classe.efeitosMatematicos.map(ef => ({ ...ef })) : []);
    }, []);

    const salvarEdicao = useCallback((id) => {
        updateFicha(f => {
            if (!f.compendioOverrides) f.compendioOverrides = {};
            if (!f.compendioOverrides.classes) f.compendioOverrides.classes = {};
            f.compendioOverrides.classes[id] = { nome: tempNome, titulo: tempTitulo, passiva: tempPassiva, desc: tempDesc, efeito: tempEfeito, iconeUrl: tempIconeUrl, efeitosMatematicos: tempEfeitosMat };
        });
        salvarFichaSilencioso(); setEditandoId(null);
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: '📜 O Mestre reescreveu os registos matemáticos do Compêndio!' });
    }, [updateFicha, tempNome, tempTitulo, tempPassiva, tempDesc, tempEfeito, tempIconeUrl, tempEfeitosMat]);

    const cancelarEdicao = useCallback(() => setEditandoId(null), []);

    const handleEfMat = useCallback((index, campo, valor) => {
        setTempEfeitosMat(prev => prev.map((ef, i) => {
            if (i === index) {
                if (campo === 'propriedade' && valor !== 'proficiencia_arma' && ef.propriedade === 'proficiencia_arma') {
                    return { ...ef, [campo]: valor, atributo: '' };
                }
                return { ...ef, [campo]: valor };
            }
            return ef;
        }));
    }, []);

    const addEfMat = useCallback(() => setTempEfeitosMat(prev => [...prev, { atributo: '', propriedade: '', valor: '' }]), []);
    const removeEfMat = useCallback((index) => setTempEfeitosMat(prev => prev.filter((_, i) => i !== index)), []);

    const handleImageUpload = useCallback((e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setTempIconeUrl(reader.result);
            reader.readAsDataURL(file);
        }
    }, []);

    const iniciarEdicaoItem = useCallback((tipo, item) => {
        setEditandoItemTipo(tipo);
        setEditandoId(item.id);
        setTempItem({ ...item });
    }, []);

    const cancelarEdicaoItem = useCallback(() => {
        setEditandoItemTipo(null);
        setEditandoId(null);
        setTempItem({});
    }, []);

    const updateTempItem = useCallback((campo, valor) => {
        setTempItem(prev => ({ ...prev, [campo]: valor }));
    }, []);

    const salvarItem = useCallback(() => {
        updateFicha(f => {
            if (!f.compendioOverrides) f.compendioOverrides = {};
            if (!f.compendioOverrides[editandoItemTipo]) f.compendioOverrides[editandoItemTipo] = {};
            
            const novoId = tempItem.id || `custom_${Date.now()}`;
            f.compendioOverrides[editandoItemTipo][novoId] = { ...tempItem, id: novoId };
        });
        salvarFichaSilencioso();
        cancelarEdicaoItem();
        enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: '📜 O Mestre forjou uma nova lei no Multiverso!' });
    }, [updateFicha, editandoItemTipo, tempItem, cancelarEdicaoItem]);

    const deletarItem = useCallback((tipo, id) => {
        if (!window.confirm("Deseja banir este registo do Multiverso?")) return;
        updateFicha(f => {
            if (!f.compendioOverrides) f.compendioOverrides = {};
            if (!f.compendioOverrides[tipo]) f.compendioOverrides[tipo] = {};
            f.compendioOverrides[tipo][id] = { deletado: true };
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const opcoesPersonagensPorMesa = useMemo(() => {
        return Object.entries(personagens || {}).filter(([n, f]) => { const m = f?.bio?.mesa || 'presente'; return m === mesaGrand || m === 'npc'; }).map(([n]) => n);
    }, [personagens, mesaGrand]);

    const value = useMemo(() => ({
        secaoAtiva, setSecaoAtiva, editandoId, tempNome, setTempNome, tempTitulo, setTempTitulo,
        tempPassiva, setTempPassiva, tempDesc, setTempDesc, tempEfeito, setTempEfeito, tempIconeUrl, setTempIconeUrl,
        tempEfeitosMat, setTempEfeitosMat, mesaGrand, setMesaGrand, isMestre,
        regulares, extras, todasClasses, grands, overridesCompendio, opcoesPersonagensPorMesa,
        condicoes, elementos, regras, 
        editandoItemTipo, tempItem, iniciarEdicaoItem, cancelarEdicaoItem, updateTempItem, salvarItem, deletarItem,
        handleDefinirGrand, handleAdicionarCandidato, handleRemoverCandidato, handleDefinirIconeGrand,
        limparIconeGrand, iniciarEdicao, salvarEdicao, cancelarEdicao, handleEfMat, addEfMat, removeEfMat, handleImageUpload
    }), [
        secaoAtiva, editandoId, tempNome, tempTitulo, tempPassiva, tempDesc, tempEfeito, tempIconeUrl, tempEfeitosMat, mesaGrand, isMestre, regulares, extras, todasClasses, grands, overridesCompendio, opcoesPersonagensPorMesa, condicoes, elementos, regras, editandoItemTipo, tempItem, iniciarEdicaoItem, cancelarEdicaoItem, updateTempItem, salvarItem, deletarItem, handleDefinirGrand, handleAdicionarCandidato, handleRemoverCandidato, handleDefinirIconeGrand, limparIconeGrand, iniciarEdicao, salvarEdicao, cancelarEdicao, handleEfMat, addEfMat, removeEfMat, handleImageUpload
    ]);

    return <CompendioFormContext.Provider value={value}>{children}</CompendioFormContext.Provider>;
}