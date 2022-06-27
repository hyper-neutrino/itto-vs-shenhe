import canvas from "canvas";
import { Client } from "discord.js";
import { readFileSync } from "fs";
import { MongoClient } from "mongodb";

const { Canvas, loadImage } = canvas;

process.on("uncaughtException", (error) => {
    console.error(error?.stack ?? error);
});

const client = new Client({
    intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"],
    partials: ["CHANNEL"],
    allowedMentions: { parse: [] },
});

const config = JSON.parse(readFileSync("config.json"));

const db = new MongoClient(config.mongo_url).db();

client.on("ready", async () => {
    client.itto = {
        server: await client.guilds.fetch(config.servers.itto.server),
        channel: await client.channels.fetch(config.servers.itto.channel),
    };

    client.shenhe = {
        server: await client.guilds.fetch(config.servers.shenhe.server),
        channel: await client.channels.fetch(config.servers.shenhe.channel),
    };

    console.log("Ready!");
});

const background = await loadImage("background.png");

const last_message = new Map();

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function constrain_text(ctx, font, text, width, height) {
    let size = height + 1 ?? 61;

    do {
        ctx.font = `${--size}px ${font}`;
    } while (
        (width && ctx.measureText(text).width > width) ||
        (height && ctx.measureText(text).height > height)
    );

    return size;
}

function title_case(text) {
    return text.charAt(0).toUpperCase() + text.substring(1);
}

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.content == "%help") {
        await message.reply({
            embeds: [
                {
                    title: "**Itto vs. Shenhe | Noodle-Eating Contest Judge**",
                    description:
                        "I am the bot responsible for counting messages for part 2 of the Itto Mains × Shenhe Mains collab event. Messages are worth up to 10 points, with the number of points granted decreasing based on how recently you sent your last message. If your last message was 40 or more seconds ago, you will receive 10 points. Otherwise, linear scaling will be applied, so if you wait 20 seconds, you will receive 5 points. This adjustment is global. This discourages spamming while not punishing users who send multiple messages legitimately.\n\n" +
                        "`%help` - this command\n" +
                        "`%score [user]` - view your own points (in both servers)\n" +
                        "`%leaderboard [page]` - view the points leaderboard and the servers' scores so far\n\n" +
                        "`%disqualify <id>` - (moderator only) disqualify a user, preventing their points from counting towards anything\n" +
                        "`%pardon <id>` - (moderator only) remove a user's disqualification",
                    footer: {
                        text: "Note: While a user is disqualified, their messages still count for points, so if you pardon someone later, they are essentially unaffected.",
                    },
                },
            ],
        });
    } else if (message.content.startsWith("%score")) {
        const data = message.content.split(/\s+/);
        if (
            data.length > 2 ||
            (data.length == 2 && !data[1].match(/<@!?\d+>|\d+/))
        ) {
            await message.reply(
                "Usage: `%score` (yourself) / `%score [mention / ID]`"
            );
        } else {
            let name, avatar, id;

            if (data.length == 1) {
                name = message.member.displayName;
                avatar = await loadImage(
                    message.member.displayAvatarURL({ format: "png" })
                );
                id = message.author.id;
            } else {
                id = data[1].match(/\d+/)[0];

                try {
                    const member = await message.guild.members.fetch(id);
                    name = member.displayName;
                    avatar = await loadImage(
                        member.displayAvatarURL({ format: "png" })
                    );
                } catch {
                    try {
                        const user = await client.users.fetch(id);
                        name = user.username;
                        avatar = await loadImage(
                            user.displayAvatarURL({ format: "png" })
                        );
                    } catch {
                        await message.reply(
                            `Could not find a user with ID \`${id}\`!`
                        );
                    }
                }
            }

            if (name && avatar) {
                const canvas = new Canvas(1000, 400);
                const ctx = canvas.getContext("2d");

                const pts =
                    (await db.collection("points").findOne({ user: id })) ?? {};

                ctx.drawImage(background, 0, 0, 1000, 400);

                ctx.fillStyle = "#0009";
                roundRect(ctx, 350, 25, 600, 100, 10);
                ctx.fill();

                const height = constrain_text(ctx, "sans-serif", name, 550, 60);

                ctx.fillStyle = pts.dq ? "#f00" : "#eee";
                ctx.fillText(
                    name,
                    650 - ctx.measureText(name).width / 2,
                    75 + height / 3,
                    550
                );

                ctx.fillStyle = "#00000078";
                roundRect(ctx, 350, 150, 600, 225, 10);
                ctx.fill();

                for (const [key, index, text] of [
                    ["itto", 0, "ɪᴛᴛᴏ"],
                    ["shenhe", 1, "sʜᴇɴʜᴇ"],
                ]) {
                    const v = index * 87;

                    ctx.fillStyle = "#bbb";
                    roundRect(ctx, 500, 201 + v, 400, 36, 10);
                    ctx.fill();

                    pts[key] ??= 0;

                    const o = Math.min((396 * pts[key]) / 1000, 396);

                    const str = Math.floor(pts[key]).toString();

                    ctx.font = "30px sans-serif";

                    const width = ctx.measureText(str).width;

                    ctx.fillStyle = "#444";
                    ctx.fillText(str, 700 - width / 2, 229 + v);

                    ctx.save();
                    ctx.beginPath();
                    roundRect(ctx, 502, 203 + v, Math.max(o, 20), 32, 10);
                    ctx.fillStyle = "#444";
                    ctx.fill();
                    ctx.clip();
                    ctx.fillStyle = "#bbb";
                    ctx.fillText(str, 700 - width / 2, 229 + v);
                    ctx.restore();

                    ctx.fillStyle = "#bbb";
                    ctx.fillText(text, 375, 229 + v);
                }

                const x = 150,
                    y = 150,
                    r = 100;

                ctx.fillStyle = "#fff5";
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(400, 0);
                ctx.lineTo(0, 240);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = pts.dq ? "#f00" : "#888";
                ctx.beginPath();
                ctx.arc(x, y, r + 3, 0, Math.PI * 2, true);
                ctx.fill();

                ctx.fillStyle = "#eee";
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2, true);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();

                ctx.drawImage(avatar, x - r, y - r, r * 2, r * 2);

                await message.reply({
                    content: pts.dq
                        ? `${
                              data.length == 1 ? "You are" : "This user is"
                          } disqualified.`
                        : undefined,
                    files: [
                        {
                            attachment: canvas.toBuffer(),
                            name: `${message.author.id}-rank.png`,
                        },
                    ],
                });
            }
        }
    } else if (message.content.startsWith("%leaderboard")) {
        const data = message.content.split(/\s+/);

        if (data.length > 2 || (data.length == 2 && !data[1].match(/\d+/))) {
            await message.reply(
                "Usage: `%leaderboard` (page 1) / `%leaderboard [page]`"
            );
        } else {
            const page = data.length == 1 ? 0 : parseInt(data[1]) - 1;

            const [key, otherkey] =
                message.guild.id == client.itto.server.id
                    ? ["itto", "shenhe"]
                    : ["shenhe", "itto"];

            const entries = (
                await db.collection("points").find({}).toArray()
            ).filter((entry) => !entry.dq);

            const totals = {};

            for (const key of ["itto", "shenhe"]) {
                totals[key] = 0;
                entries.forEach((entry) => (totals[key] += entry[key] ?? 0));
            }

            await message.reply({
                embeds: [
                    {
                        title: "**Noodle-Eating Contest | Leaderboard**",
                        description:
                            `**${title_case(key)} Mains: ${Math.floor(
                                totals[key]
                            )} points\n${title_case(
                                otherkey
                            )} Mains: ${Math.floor(
                                totals[otherkey]
                            )} points**\n\n` +
                            entries
                                .filter((entry) => entry[key])
                                .sort((a, b) => a[key] ?? 0 - b[key] ?? 0)
                                .slice(page * 20, page * 20 + 20)
                                .map(
                                    (entry) =>
                                        `<@${entry.user}> - **${Math.floor(
                                            entry[key] ?? 0
                                        )}** (${Math.floor(
                                            entry[otherkey] ?? 0
                                        )})`
                                )
                                .join("\n"),
                        footer: {
                            text: `The bolded number is for this server and the bracketed number is for the other server.`,
                        },
                    },
                ],
            });
        }
    } else if (
        message.content.startsWith("%disqualify") ||
        message.content.startsWith("%pardon")
    ) {
        if (!message.member.permissions.has("BAN_MEMBERS")) {
            await message.react("❌");
        } else {
            const data = message.content.split(/\s+/);

            if (data.length != 2 || !data[1].match(/<@!?\d+>|\d+/)) {
                await message.reply(`Usage: \`${data[0]} [mention / ID]\``);
            } else {
                const id = data[1].match(/\d+/)[0];
                await db
                    .collection("points")
                    .findOneAndUpdate(
                        { user: id },
                        { $set: { dq: data[0] == "%disqualify" } },
                        { upsert: true }
                    );
                await message.reply({
                    content: `${
                        data[0] == "%disqualify" ? "Disqualified" : "Pardoned"
                    } <@${id}>.`,
                    allowedMentions: { parse: [] },
                });
            }
        }
    }

    if (
        message.channel.id != client.itto.channel.id &&
        message.channel.id != client.shenhe.channel.id
    ) {
        return;
    }

    let points;

    if (last_message.has(message.author.id)) {
        points = Math.min(
            10,
            (message.createdAt - last_message.get(message.author.id)) / 4000
        );
    } else {
        points = 10;
    }

    await db.collection("points").findOneAndUpdate(
        { user: message.author.id },
        {
            $inc: {
                [message.channel.id == client.itto.channel.id
                    ? "itto"
                    : "shenhe"]: points,
            },
        },
        { upsert: true }
    );

    last_message.set(message.author.id, message.createdAt);
});

client.login(config.discord_token);
