// copy the cookie header from dev tools on cohost.org
export const COOKIE = 'connect.sid=adhjsakfahdsfjkash';

// load all of your own posts
export const PROJECTS = ['your-handle'];

// load some specific additional posts (e.g. from GDPR export data)
export const POSTS = [
    'https://cohost.org/example/123456-example-post'
];

// some CSS posts contain external images that load forever
export const DO_NOT_FETCH_DOMAINS = ['an-external-domain-that-breaks-the-program.com'];
