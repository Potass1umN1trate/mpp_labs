//export const revalidate = 1;

export default async function Page() {
  const data = await fetch("https://api.vercel.app/blog", { next: { revalidate: 1 }});
  const posts = await data.json();

  return (
    <main>
      <h1>Blog Posts</h1>
      <ul>
        {posts.map((post : {id: number, title: string}) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </main>
  )
}