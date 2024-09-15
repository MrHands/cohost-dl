import {
    COOKIE,
    DATA_PORTABILITY_ARCHIVE_PATH,
    ENABLE_JAVASCRIPT,
    POSTS,
    PROJECTS,
    SKIP_POSTS,
} from "./src/config.ts";
import { CohostContext, POST_URL_REGEX } from "./src/context.ts";
import { loadAllLikedPosts } from "./src/likes.ts";
import { FROM_POST_PAGE_TO_ROOT, loadPostPage } from "./src/post-page.ts";
import { loadAllProjectPosts } from "./src/project.ts";
import { IPost } from "./src/model.ts";
import { readDataPortabilityArchiveItems } from "./src/data-portability-archive.ts";
import { loadCohostSource } from "./src/cohost-source.ts";
import { generateAllScripts } from "./src/scripts/index.ts";
import { rewritePost } from "./src/post.ts";
import { generateAllProjectIndices } from "./src/project-index.ts";

const ctx = new CohostContext(COOKIE, "out");
await ctx.init();

{
    // check that login actually worked
    const loginStateResponse = await ctx.get(
        "https://cohost.org/api/v1/trpc/login.loggedIn?batch=1&input=%7B%7D",
    );
    const loginState = await loginStateResponse.json();
    if (!loginState[0].result.data.loggedIn) {
        console.error(
            "warning:\nNot logged in. Please update your cookie configuration\n\n",
        );
    } else {
        console.log(`logged in as ${loginState[0].result.data.email}`);
    }
}

// JSON data
{
    // load all liked posts for the current page
    if (!(await ctx.hasFile("liked.json"))) {
        const liked = await loadAllLikedPosts(ctx);
        await ctx.write("liked.json", JSON.stringify(liked));
    }

    // load all project posts
    for (const handle of PROJECTS) {
        if (!(await ctx.hasFile(`${handle}/posts.json`))) {
            const posts = await loadAllProjectPosts(ctx, handle);
            await ctx.write(`${handle}/posts.json`, JSON.stringify(posts));
        }
    }
}

// javascript
if (ENABLE_JAVASCRIPT) {
    const dir = await loadCohostSource(ctx);
    await generateAllScripts(ctx, dir);
}

const errors: { url: string; error: Error }[] = [];

// Single post pages
{
    const likedPosts = await ctx.readJson("liked.json") as IPost[];
    const projectPosts = await Promise.all(
        PROJECTS.map((handle) => ctx.readJson(`${handle}/posts.json`)),
    ) as IPost[][];

    const allPosts = [
        ...likedPosts,
        ...projectPosts.flatMap((x) => x),
    ];

    const loadPostPageAndCollectError = async (url: string) => {
        try {
            await loadPostPage(ctx, url);
        } catch (error) {
            console.error(`\x1b[31mFailed! ${error}\x1b[m`);
            errors.push({ url, error });
        }
    };

    for (const post of allPosts) {
        if (SKIP_POSTS.includes(post.postId)) continue;

        console.log(`~~ processing post ${post.singlePostPageUrl}`);
        await loadPostPageAndCollectError(post.singlePostPageUrl);
    }

    // it can happen that we've cached data for a post that is now a 404.
    // I suppose we can try loading resources for those as well?
    for (const post of allPosts) {
        await rewritePost(ctx, post, FROM_POST_PAGE_TO_ROOT);
    }

    const dpaPostURLs: string[] = [];
    if (DATA_PORTABILITY_ARCHIVE_PATH) {
        const items = await readDataPortabilityArchiveItems(
            DATA_PORTABILITY_ARCHIVE_PATH,
        );
        for (const ask of items.asks) {
            if (ask.responsePost) {
                dpaPostURLs.push(ask.responsePost);
            }
        }
        for (const comment of items.comments) {
            if (comment.post) {
                dpaPostURLs.push(comment.post);
            } else {
                console.log(`comment ${comment.commentId} has no post`);
            }
        }
    }

    for (const post of [...POSTS, ...dpaPostURLs]) {
        const probablyThePostId = +(post.match(POST_URL_REGEX)?.[2] || "");
        if (SKIP_POSTS.includes(probablyThePostId)) continue;

        console.log(`~~ processing additional post ${post}`);
        await loadPostPageAndCollectError(post);
    }
}

{
    await generateAllProjectIndices(ctx);
}

await ctx.finalize();

if (errors.length) {
    console.log(
        `Done, with ${errors.length} error${errors.length === 1 ? "" : "s"}`,
    );
    for (const { url, error } of errors) console.log(`${url}: ${error}`);
} else {
    console.log("Done");
}
