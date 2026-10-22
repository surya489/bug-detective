export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  language: string | null;
  starsCount: number;
  forksCount: number;
  updatedAt: string;
};

export async function fetchUserRepositories(
  accessToken: string,
): Promise<GitHubRepository[]> {
  const repositories: GitHubRepository[] = [];
  const pageSize = 100;

  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/user/repos?visibility=all&sort=updated&per_page=${pageSize}&affiliation=owner,collaborator,organization_member&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Bug-Detective",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch user repositories: ${response.status}`);
    }

    const data = (await response.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
        avatar_url: string;
      };
      description: string | null;
      html_url: string;
      private: boolean;
      default_branch: string;
      language: string | null;
      stargazers_count: number;
      forks_count: number;
      updated_at: string;
    }>;

    repositories.push(
      ...data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
        },
        description: repo.description,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch,
        language: repo.language,
        starsCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        updatedAt: repo.updated_at,
      })),
    );

    if (data.length < pageSize) break;
  }

  return repositories;
}
