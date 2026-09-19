# 🧪 Sistema de Alquimia

<p align="center">
<img src="assets/alchemy.svg" alt="Frasco de alquimia" width="112" />
</p> <p align="center"><strong>Descubra. Experimente. Fabrique.</strong>  
Um laboratório completo para campanhas de <strong>Foundry VTT v13</strong> com <strong>D&D 5e</strong>.</p> <p align="center">
  <img src="https://img.shields.io/badge/Foundry_VTT-v13-7b61ff?style=for-the-badge" alt="Foundry VTT v13" />
  <img src="https://img.shields.io/badge/D%26D_5e-%E2%89%A54.0.0-cb3b3b?style=for-the-badge" alt="D&D 5e 4.0.0 ou superior" />
  <img src="https://img.shields.io/badge/idioma-pt--BR-2d8a62?style=for-the-badge" alt="Português do Brasil" />
  <img src="https://img.shields.io/badge/licen%C3%A7a-MIT-e0b252?style=for-the-badge" alt="Licença MIT" />
</p>

O **Sistema de Alquimia** transforma o inventário do personagem em um laboratório vivo: jogadores aprendem receitas, combinam ingredientes, descobrem resultados e registram sua evolução. Mestres controlam a biblioteca, o conhecimento individual e toda a administração da fabricação — sem processo de compilação e sem dependências JavaScript externas.

## ✨ O que o módulo oferece

| Para jogadores | Para Mestres |
| --- | --- |
| Experimentação com 2 ou 3 ingredientes | Biblioteca global de receitas |
| Poções, venenos e resultados especiais | Conhecimento individual por personagem |
| Favoritos, histórico e anotações privadas | Editor, duplicação, importação e exportação |
| Testes opcionais, qualidade e progressão | Logs, configurações e restauração de exemplos |

> **Estado do projeto:** versão **1.2.0**, núcleo funcional estável e validado para Foundry VTT v13.

## 🚀 Comece em poucos minutos

1. Copie o projeto para `{FoundryData}/Data/modules/alchemy-system/`.

1. Reinicie o Foundry e abra um mundo baseado em **dnd5e**.

1. Em **Gerenciar Módulos**, ative **Sistema de Alquimia**.

1. Abra o laboratório pelo botão de frasco próximo ao chat.

O Mestre pode liberar receitas pela **Administração de Alquimia**. Jogadores também podem descobri-las por experimentação, caso essa opção esteja ativa.

## Requisitos e compatibilidade

| Componente | Requisito |
| --- | --- |
| Foundry VTT | v13 ou superior dentro da série v13 |
| Sistema | dnd5e 4.0.0 ou superior compatível com Foundry v13 |
| Midi-QOL | Opcional; ausência não bloqueia nenhuma função básica |
| Idioma incluído | Português do Brasil (`pt-BR` ) |

A aplicação usa `ApplicationV2` com `HandlebarsApplicationMixin`, ES Modules, configurações oficiais de `game.settings`, documentos incorporados de ator e o socket próprio `module.alchemy-system`.[1] [2]

## Instalação

Para instalação manual, copie o conteúdo deste projeto para `{FoundryData}/Data/modules/alchemy-system/`. **A pasta instalada deve se chamar ****`alchemy-system`**, pois o identificador do manifesto precisa corresponder ao nome da pasta. O diretório de entrega pode se chamar `alchemy-module`, mas deve ser renomeado durante a instalação manual.[1]

Reinicie o Foundry, abra o mundo dnd5e, acesse **Gerenciar Módulos**, ative **Sistema de Alquimia** e recarregue o mundo. O módulo está funcionando quando um botão de frasco aparece próximo à entrada do chat. O Mestre também encontra uma ferramenta de administração nos controles de Token.

## Primeiro uso

O módulo identifica um personagem nesta ordem: primeiro token controlado, depois personagem atribuído ao usuário e, por fim, um ator que o usuário possua. O jogador abre a aplicação pelo botão no chat ou pela API:

```
game.modules.get("alchemy-system").api.open();
// ou
AlchemyModule.open();
```

Por padrão, personagens novos não conhecem receitas. O Mestre abre **Administração de Alquimia**, escolhe o personagem e marca as receitas iniciais. Alternativamente, se experimentação e descoberta automática estiverem ativas, o personagem aprende uma receita ao testar a combinação correta.

## Ingredientes

A identificação prioriza a flag própria:

```
await item.setFlag("alchemy-system", "ingredient", {
  category: "Erva",
  rarity: "common",
  properties: ["cura", "natural"],
  potency: 1,
  toxicity: 0,
  stability: 2,
  tags: ["restauradora"]
});
```

O módulo também aceita a estrutura legada `flags.alchemy` e, se a configuração correspondente estiver ativa, usa tipo e palavras do nome como fallback. Itens `loot`, `consumable`, `equipment` ou `tool` com nomes como “erva”, “raiz”, “cogumelo”, “cristal”, “essência” ou “reagente” podem ser detectados. A quantidade vem de `item.system.quantity`.

A API permite criar um ingrediente corretamente marcado:

```
await AlchemyModule.addIngredient(actor, {
  name: "Erva Vermelha",
  quantity: 3,
  category: "Erva",
  properties: ["cura", "natural"]
});
```

## Fluxo do jogador

Na aba **Criar e experimentar**, receitas conhecidas informam disponibilidade. **Fabricar** escolhe os documentos de inventário correspondentes e envia uma solicitação ao Mestre ativo. O executor revalida permissão, receita, IDs, quantidades e equipamento. Ele então realiza o teste opcional, atualiza quantidades, cria o item e registra histórico.

Na experimentação, o jogador seleciona dois ou três documentos diferentes. Uma combinação correta pode produzir o item e desbloquear a receita. Uma combinação desconhecida segue a política mundial: falha simples ou mistura defeituosa. O consumo em falhas é configurável.

As abas restantes exibem receitas conhecidas, receitas desconhecidas segundo a política de ocultação, histórico individual e anotações gerais privadas. Favoritos são persistidos no ator.

## Administração do Mestre

O painel administrativo oferece biblioteca global, editor, duplicação, exclusão, importação, exportação, restauração dos exemplos, conhecimento individual e logs. O campo de ingredientes usa uma linha por requisito:

```
1|Erva Vermelha
1|Água Purificada
```

Receitas por propriedade usam `@` e `+`:

```
1|@cura+natural
1|@líquido
```

Cada receita aceita exatamente dois ou três requisitos. O editor também define tipo de resultado, quantidade, descrição, fórmula informativa, teste, CD, equipamento e tempo em minutos. O tempo é armazenado para expansão; a versão 1.0 executa produção imediatamente.

Para conceder ou bloquear receitas, selecione um ator, marque ou desmarque as receitas e salve. Logs globais mantêm as 500 entradas mais recentes produzidas pelo executor Mestre. Históricos individuais possuem limite configurável entre 25 e 500 entradas.

## Configurações

| Grupo | Configurações principais |
| --- | --- |
| Conhecimento | Ativar conhecimento individual, descoberta automática e política de receitas desconhecidas |
| Criação | Consumo, consumo em falha, falhas, experimentação e resultado defeituoso |
| Testes | Ativar testes por receita; a receita define perícia, atributo ou fórmula e CD |
| Requisitos | Exigir ou ignorar equipamentos cadastrados na receita |
| Interface | Tema local: pergaminho, escuro ou claro |
| Comunicação | Chat para todos, proprietários, Mestre ou desativado |
| Administração | Leitura opcional de notas, limite de histórico e modo de depuração |

As configurações mundiais só podem ser alteradas pelo Mestre. Tema e tutorial são locais ao navegador.

## Testes de alquimia

Quando possível, o motor chama métodos nativos dnd5e para perícia ou atributo. Se a API do sistema não estiver disponível, ele avalia uma `Roll` do Foundry. O resultado é classificado como sucesso crítico em 20 natural, sucesso ao alcançar a CD, sucesso parcial até dois pontos abaixo, falha ou falha crítica em 1 natural. Sucesso crítico produz uma unidade adicional; sucesso parcial usa qualidade fraca; falhas seguem as configurações mundiais.

## Segurança, concorrência e compensação

Toda execução revalida os dados. Solicitações de jogador são delegadas ao primeiro Mestre ativo por um protocolo de socket com resposta direcionada e timeout. O executor testa propriedade do ator em nome do solicitante. Um bloqueio local por ator serializa solicitações no cliente executor, e uma flag temporária torna o estado observável. Esse desenho protege contra clique duplo, repetição acidental e concorrência entre jogadores quando há um Mestre ativo.

O consumo atualiza os itens em uma única chamada `updateEmbeddedDocuments`. Itens zerados não são excluídos, o que permite compensação. Se a criação do resultado falhar, o motor restaura as quantidades anteriores. Foundry não oferece uma transação ACID única que combine atualizações e criação de documentos; portanto, este é um **padrão de transação compensatória**, não uma transação de banco de dados.

## Midi-QOL e Active Effects

A integração é detectada por `game.modules.get("midi-qol")?.active`. Sem Midi-QOL, itens continuam sendo criados normalmente. Com ele ativo, flags configuradas em `result.midiFlags` são copiadas para `flags.midi-qol`, e Active Effects da receita são incorporados ao item. O módulo evita chamar funções internas instáveis do Midi-QOL.

Venenos guardam metadados como doses, aplicação, CD, salvaguarda, dano e condições em `flags.alchemy-system.poison`. A API `applyPoisonToWeapon(actor, poison, weapon)` consome uma unidade do veneno e registra `flags.alchemy-system.appliedPoison` na arma. Uma futura macro Midi-QOL pode consumir ataques restantes.

## Armazenamento

| Dado | Local |
| --- | --- |
| Biblioteca global | `game.settings`: `alchemy-system.recipes` |
| Logs do Mestre | `game.settings`: `alchemy-system.gmLogs`, máximo 500 |
| Conhecimento | `actor.flags.alchemy-system.knowledge` |
| Histórico | `actor.flags.alchemy-system.history`, limite configurável |
| Anotações | `actor.flags.alchemy-system.notes` |
| Favoritos | `actor.flags.alchemy-system.favorites` |
| Progressão básica | `actor.flags.alchemy-system.progression` |
| Bloqueio temporário | `actor.flags.alchemy-system.craftLock` |

O campo `schemaVersion` sustenta migrações futuras. A inicialização valida receitas antigas e grava a versão atual.

## API pública

A API está disponível em `game.modules.get("alchemy-system").api` e `globalThis.AlchemyModule`.

| Método | Função |
| --- | --- |
| `open(actor?, options?)` | Abre a aplicação do jogador |
| `openGM(options?)` | Abre o painel administrativo |
| `getRecipes()` / `getRecipe(id)` | Consulta a biblioteca |
| `createRecipe(data)` / `updateRecipe(data)` | Valida e salva receita; requer Mestre |
| `deleteRecipe(id)` | Exclui receita; requer Mestre |
| `unlockRecipe(actor, id)` / `lockRecipe(actor, id)` | Controla conhecimento |
| `craftRecipe(actor, recipeId, ingredientIds)` | Fabrica uma receita conhecida |
| `experiment(actor, ingredientIds)` | Executa experimentação |
| `getIngredients(actor)` | Lista ingredientes detectados |
| `addIngredient(actor, data)` | Cria item marcado como ingrediente |
| `getPlayerHistory(actor)` | Consulta histórico individual |
| `applyPoisonToWeapon(actor, poison, weapon)` | Consome dose e marca a arma |
| `midiStatus()` | Informa disponibilidade e versão do Midi-QOL |

Exemplo:

```
const api = game.modules.get("alchemy-system").api;
const ingredients = api.getIngredients(actor);
await api.craftRecipe(actor, "minor-healing-potion", ingredients.slice(0, 2).map(i => i.id));
```

## Hooks para desenvolvedores

| Hook | Argumentos | Comportamento |
| --- | --- | --- |
| `beforeAlchemyCraft` | `{actor, recipe, assignments, experiment, requestUser}` | Cancelável ao retornar `false`; não deve usar callback assíncrono |
| `afterAlchemyCraft` | `entry, createdItems` | Disparado depois do histórico e chat |
| `onRecipeDiscovered` | `actor, recipeId, options` | Disparado quando uma receita é aprendida |
| `onAlchemyFailure` | `historyEntry` | Disparado em falha conhecida ou combinação inválida |
| `alchemyRecipesUpdated` | `recipes` | Disparado após salvar a biblioteca global |

Hooks canceláveis do Foundry são síncronos e não aguardam `Promise`; integrações devem respeitar essa limitação.[3]

## Estrutura do projeto

```
alchemy-system/
├── module.json
├── README.md
├── LICENSE
├── assets/
├── lang/pt-BR.json
├── scripts/
│   ├── main.js, api.js, constants.js, utils.js
│   ├── data.js, actor-data.js, inventory.js, crafting.js
│   ├── settings.js, socket.js, midi.js
│   └── apps/alchemy-app.js, apps/gm-app.js
├── styles/alchemy.css
├── templates/alchemy-main.hbs, gm-panel.hbs
└── tools/validate.mjs
```

## Solução de problemas

Se o botão não aparecer, confirme o nome da pasta, a ativação do módulo e o sistema dnd5e. Se ingredientes não aparecerem, marque-os com a flag documentada ou ative o fallback de nome. Se uma fabricação ficar bloqueada, aguarde 30 segundos; locks antigos expiram automaticamente. Se testes nativos mudarem após uma atualização do dnd5e, o fallback por `Roll` preserva o núcleo. Ative **Modo de depuração** e consulte o console do navegador para detalhes.

## Escopo e roadmap

O núcleo implementa dados funcionais para propriedades, qualidade, quantidade, venenos, progressão e tempo. A versão 1.0 não agenda produção em tempo real, não oferece barra de progresso persistente, não executa automaticamente efeitos de veneno a cada ataque e não possui especializações mecânicas. Essas extensões devem reutilizar os campos existentes, a API e os hooks.

O roadmap recomendado inclui fila de produção baseada em tempo de campanha, estações como documentos de cena, editor visual de Active Effects, doses automatizadas por Midi-QOL, anotações por receita e ingrediente na interface, filtros avançados de logs e migrações com backup prévio.

## Validação local

Execute na raiz do módulo:

```bash
node tools/validate.mjs
```

O script valida JSON, sintaxe de todos os ES Modules, caminhos do manifesto, imports relativos, receitas de exemplo e correspondência de ingredientes.

## Referências

[1]: https://foundryvtt.com/article/module-development/ "Introduction to Module Development"

[2]: https://foundryvtt.wiki/en/development/api/applicationv2 "ApplicationV2"

[3]: https://foundryvtt.com/api/v13/classes/foundry.helpers.Hooks.html "Foundry VTT v13 Hooks API"
