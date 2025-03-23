const defaultOrder = ["@use", "--variable", "$variable", "@if", "decl", "@include", "@mixin", "rule"];
const defaultGroups = {
    "@use": { type: "use" },
    "@mixin": { type: "mixin" },
    "--variable": { type: "variable" },
    $variable: { type: "$variable" },
    decl: { type: "decl" },
    "@include": { type: "include" },
    rule: { type: "rule" },
    "@if": { type: "if" },
    "@else": { type: "else" }
};

function nodeGroup(node, groups) {
    const nodeGroups = [];
    for (let group in groups) {
        if (checkCriteria(node, groups[group])) {
            nodeGroups.push(group);
        }
    }
    return nodeGroups;
}

function checkCriteria(node, criterias) {
    for (let criteria in criterias) {
        switch (criteria) {
            case "type":
                if (nodeType(node) != criterias[criteria]) return false;
                break;
            case "startsWith":
                if (!nodeName(node).startsWith(criterias[criteria])) return false;
                break;
        }
    }
    return true;
}

/**
 *
 * @param {String[]} order
 * @param {Map<Node, String[]>} groupMap
 * @returns
 */
function createComparerByType(order, groupMap) {
    return (a, b) => {
        const aGroups = groupMap.get(a) ?? [];
        const bGroups = groupMap.get(b) ?? [];
        const aIndex = order.findIndex(group => aGroups.includes(group));
        const bIndex = order.findIndex(group => bGroups.includes(group));

        if (aIndex == -1) return 1;
        if (bIndex == -1) return -1;
        return aIndex - bIndex;
    };
}

function nodeName(node) {
    switch (node.type) {
        case "atrule":
            return node.name;
        case "rule":
            return node.selector;
        case "decl":
            return node.prop;
        default:
            return "comment";
    }
}

function nodeType(node) {
    switch (node.type) {
        case "atrule":
            if (node.name == "use") return "use";
            if (node.name == "mixin") return "mixin";
            if (node.name == "include") return "include";
            if (node.name == "if") return "if";
            if (node.name == "else") return "else";
            return "atrule";
        case "rule":
            return "rule";
        case "decl":
            if (!node.variable) return "decl";
            if (node.prop[0] == "$") return "$variable";
            return "variable";
        default:
            return "comment";
    }
}

function splitGroups(nodes, groups) {
    function cleanEnding(node) {
        node.raws.before = node.raws.before.replace(/\n+/g, "\n");
        node.raws.after = undefined;
    }
    if (nodes.length == 0) return;

    cleanEnding(nodes[0]);
    if (nodes.length == 1) return;

    let lastGroup = groups.get(nodes[0]);
    for (let i = 1; i < nodes.length - 1; i++) {
        const node = nodes[i];
        const currentGroups = groups.get(node);
        cleanEnding(node);
        if (!lastGroup.some(g => currentGroups.includes(g))) {
            node.raws.before = "\n" + (node.raws.before ?? "");
            lastGroup = currentGroups;
        }
    }
    cleanEnding(nodes.at(-1));
}
function removeElseStatements(nodes, groups) {
    const elseStatements = [];
    for (let i = nodes.length; i-- > 0; ) {
        const node = nodes[i];
        const nodeGroup = groups.get(node);
        if (nodeGroup.includes("@else")) {
            elseStatements.push({
                node,
                prev: node.prev()
            });
            node.remove();
        }
    }
    return elseStatements;
}

function appendElseStatements(elseStatements) {
    for (let i = elseStatements.length; i-- > 0; ) {
        const { node, prev } = elseStatements[i];
        prev.after(node);
    }
}

export function grundyPropSorter({ groups = {}, order = defaultOrder, withRoot = false } = {}) {
    groups = Object.assign({}, defaultGroups, groups);

    function runComparer(nodes) {
        if (Array.isArray(nodes)) {
            const groupMap = new Map(nodes.map(node => [node, nodeGroup(node, groups)]));
            const elseStatements = removeElseStatements(nodes, groupMap);
            const typeComparer = createComparerByType(order, groupMap);
            nodes.sort(typeComparer);
            splitGroups(nodes, groupMap);
            appendElseStatements(elseStatements);
        }
    }
    return {
        postcssPlugin: "grundy-scss-order",
        OnceExit: css => {
            if (withRoot) {
                runComparer(css.nodes);
            }
            css.walk(node => {
                runComparer(node.nodes);
            });
        }
    };
}

grundyPropSorter.postcss = true;
