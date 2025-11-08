import { DeployProxyOptions } from "@openzeppelin/hardhat-upgrades/dist/utils";
import { Signer } from "ethers";
import { deployments, ethers, upgrades } from "hardhat";

interface CustomProxyOptions {
  instanceName?: string;
  contructorArgs?: unknown[];
  proxyOpts?: DeployProxyOptions;
  from?: Signer | string;
}

export const customDeployProxyWrapper = async (artifactsName: string, opts: CustomProxyOptions) => {
  opts.instanceName = opts.instanceName ?? artifactsName;

  const oldInstacte = await deployments.getOrNull(opts.instanceName);

  if (oldInstacte) {
    console.log(`${opts.instanceName.toUpperCase()}_ADDRESS=${oldInstacte.address}`);

    return;
  }

  // If from is a Signer, use it; otherwise, don't pass the signer parameter
  // @nomicfoundation/hardhat-ethers doesn't support address strings for signer parameter
  let contractFactory;
  if (opts.from && typeof opts.from !== 'string') {
    // from is a Signer
    contractFactory = await ethers.getContractFactory(artifactsName, opts.from);
  } else {
    // from is a string or undefined - don't pass signer, will use default
    contractFactory = await ethers.getContractFactory(artifactsName);
  }

  const proxyInstance = await upgrades.deployProxy(
    contractFactory,
    opts.contructorArgs,
    opts.proxyOpts
  );

  // In ethers v6, the address is on the target property
  const contractAddress = await proxyInstance.getAddress();

  const extendsArtifacts = await deployments.getExtendedArtifact(artifactsName);

  let proxyDeployments: any = {
    address: contractAddress,
    ...extendsArtifacts,
  };

  await deployments.save(opts.instanceName, proxyDeployments);

  // console.log(
  //   `Contract ${opts.instanceName} proxy deployed at ${contractAddress}`
  // );
  console.log(`${opts.instanceName.toUpperCase()}_ADDRESS=${contractAddress}`);
};
