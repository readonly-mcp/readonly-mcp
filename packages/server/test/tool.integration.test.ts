// @module-tag integration
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { z } from 'zod';
import { ArgsSchema } from '#src/lib/allowlist.js';
import { type Plan, reject, run } from '#src/lib/plan.js';
import { type Tool, defineTool } from '#src/lib/tool.js';
import { connectServer, textOf } from '#test/helpers.js';

// A tool definition whose plan is `plan`, under a generated name and description.
const definitionPlanning = (plan: (args: readonly string[]) => Plan) => ({
  description: faker.lorem.sentence(),
  inputSchema: ArgsSchema,
  name: faker.lorem.slug(),
  plan: ({ args }: { readonly args: readonly string[] }) => plan(args),
});

// A server with only `tool` registered, closed when the test's scope ends.
const connect = async (tool: Tool) => {
  const server = connectServer([tool]);
  await server.initialize();
  return { ...server, [Symbol.asyncDispose]: server.close };
};

// Node args that print the args after them, space-separated.
const echo = ['-e', 'process.stdout.write(process.argv.slice(1).join(" "))'];

describe(defineTool, () => {
  it('lists the tool under its name and description', async ({ expect }) => {
    const definition = definitionPlanning(() => reject(faker.lorem.sentence()));
    await using server = await connect(defineTool(definition));

    const tools = await server.listTools();

    expect(tools.map(({ description, name }) => ({ description, name })))
      .toStrictEqual([{ description: definition.description, name: definition.name }]);
  });

  it('answers a call with the output of the command its plan runs', async ({ expect }) => {
    const words = faker.lorem.words({ max: 4, min: 2 }).split(' ');
    const tool = defineTool(definitionPlanning(args => run(process.execPath, [...echo, ...args])));
    await using server = await connect(tool);

    const result = await server.callTool(tool.name, { args: words });

    expect(textOf(result)).toBe(words.join(' '));
  });

  it('answers a call with the rejection its plan returns', async ({ expect }) => {
    const reason = faker.lorem.sentence();
    const tool = defineTool(definitionPlanning(() => reject(reason)));
    await using server = await connect(tool);

    const result = await server.callTool(tool.name, { args: [] });

    expect(result).toBeBlocked();
    expect(textOf(result)).toBe(reason);
  });

  it('hands the plan its input as the schema transformed it, once', async ({ expect }) => {
    const word = faker.lorem.word();
    const suffix = faker.string.alpha(6);
    const tool = defineTool({
      description: faker.lorem.sentence(),
      inputSchema: { word: z.string().transform(value => `${value}${suffix}`) },
      name: faker.lorem.slug(),
      plan: input => run(process.execPath, [...echo, input.word]),
    });
    await using server = await connect(tool);

    const result = await server.callTool(tool.name, { word });

    expect(textOf(result)).toBe(`${word}${suffix}`);
  });
});
